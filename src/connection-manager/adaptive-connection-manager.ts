export type NetworkType = "wifi" | "cellular" | "unknown" | "offline";
export interface ConnectionManagerOptions {
  initialIdleTimeoutMs?: number;
  minIdleTimeoutMs?: number;
  maxIdleTimeoutMs?: number;
  emaAlpha?: number;
  heartbeatRatio?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  random?: () => number;
}
export interface ConnectionMetrics {
  observedDisconnects: number;
  reconnectAttempts: number;
  heartbeatsScheduled: number;
  queuedMessages: number;
  acknowledgedMessages: number;
  currentNetwork: NetworkType;
  foregroundProtectionEnabled: boolean;
  consecutiveConnectionFailures: number;
  lastHeartbeatRttMs: number | null;
}

export type ConnectionManagerEvent =
  | { type: "connected" }
  | { type: "disconnected"; consecutiveFailures: number }
  | { type: "event_received"; eventId: string }
  | { type: "intent_queued"; intentId: string }
  | { type: "item_acknowledged"; messageId: string }
  | { type: "item_failed"; messageId: string; reason: string }
  | { type: "reconnected"; reconnectAttempts: number }
  | { type: "recovery_completed" };

export type ConnectionManagerEventListener = (
  event: ConnectionManagerEvent,
) => void;

export interface OutboxMessage {
  id: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
}
export class AdaptiveConnectionManager {
  private idleTimeoutMs: number;
  private readonly minIdleTimeoutMs: number;
  private readonly maxIdleTimeoutMs: number;
  private readonly emaAlpha: number;
  private readonly heartbeatRatio: number;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly random: () => number;
  private network: NetworkType = "unknown";
  private foregroundProtectionEnabled = false;
  private readonly outbox = new Map<string, OutboxMessage>();
  private readonly acknowledged = new Set<string>();
  private readonly eventListeners = new Set<ConnectionManagerEventListener>();

  onEvent(listener: ConnectionManagerEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private emit(event: ConnectionManagerEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }
  private observedDisconnects = 0;
  private reconnectAttempts = 0;
  private heartbeatsScheduled = 0;
  private consecutiveConnectionFailures = 0;
  private lastHeartbeatRttMs: number | null = null;
  constructor(options: ConnectionManagerOptions = {}) {
    this.minIdleTimeoutMs = options.minIdleTimeoutMs ?? 15_000;
    this.maxIdleTimeoutMs = options.maxIdleTimeoutMs ?? 300_000;
    this.idleTimeoutMs = options.initialIdleTimeoutMs ?? 60_000;
    this.emaAlpha = options.emaAlpha ?? 0.2;
    this.heartbeatRatio = options.heartbeatRatio ?? 0.8;
    this.reconnectBaseMs = options.reconnectBaseMs ?? 1_000;
    this.reconnectMaxMs = options.reconnectMaxMs ?? 60_000;
    this.random = options.random ?? Math.random;
    if (
      this.minIdleTimeoutMs <= 0 ||
      this.maxIdleTimeoutMs < this.minIdleTimeoutMs ||
      this.idleTimeoutMs <= 0
    ) {
      throw new TypeError("Invalid idle timeout bounds");
    }
    if (this.emaAlpha <= 0 || this.emaAlpha > 1) {
      throw new TypeError("emaAlpha must be greater than 0 and at most 1");
    }
    if (this.heartbeatRatio < 0.7 || this.heartbeatRatio > 0.85) {
      throw new TypeError("heartbeatRatio must be between 0.7 and 0.85");
    }
    if (
      this.reconnectBaseMs <= 0 ||
      this.reconnectMaxMs < this.reconnectBaseMs
    ) {
      throw new TypeError("Invalid reconnect delay bounds");
    }
    if (
      this.idleTimeoutMs < this.minIdleTimeoutMs ||
      this.idleTimeoutMs > this.maxIdleTimeoutMs
    ) {
      throw new TypeError(
        "Initial idle timeout must be within configured bounds",
      );
    }
  }
  observeIdleDisconnect(
    observedIdleMs: number,
    evidence: { reliable?: boolean; complete?: boolean } = {},
  ): number {
    if (!Number.isFinite(observedIdleMs) || observedIdleMs <= 0) {
      throw new TypeError("observedIdleMs must be positive");
    }

    if (evidence.reliable === false || evidence.complete === false) {
      return this.idleTimeoutMs;
    }

    this.idleTimeoutMs = Math.min(
      this.maxIdleTimeoutMs,
      Math.max(
        this.minIdleTimeoutMs,
        this.idleTimeoutMs +
          this.emaAlpha * (observedIdleMs - this.idleTimeoutMs),
      ),
    );

    this.observedDisconnects += 1;
    return this.idleTimeoutMs;
  }
  getLearnedIdleTimeoutMs(): number {
    return this.idleTimeoutMs;
  }
  getHeartbeatDelayMs(): number {
    const jitterFactor = 0.95 + this.random() * 0.1;
    const boundedRatio = Math.min(
      0.85,
      Math.max(0.7, this.heartbeatRatio * jitterFactor),
    );
    this.heartbeatsScheduled += 1;
    return Math.round(this.idleTimeoutMs * boundedRatio);
  }
  private heartbeatDeadlineMs: number | null = null;
  private heartbeatTimedOut = false;

  recordHeartbeatSent(sentAtMs: number): void {
    if (!Number.isFinite(sentAtMs) || sentAtMs < 0) {
      throw new TypeError("sentAtMs must be a finite, non-negative timestamp");
    }

    this.heartbeatDeadlineMs = sentAtMs + this.getHeartbeatDelayMs();
    this.heartbeatTimedOut = false;
  }

  recordHeartbeatRtt(rttMs: number): void {
    if (!Number.isFinite(rttMs) || rttMs < 0) {
      throw new TypeError(
        "Heartbeat RTT must be a finite, non-negative number",
      );
    }

    this.lastHeartbeatRttMs = rttMs;
    this.heartbeatDeadlineMs = null;
    this.heartbeatTimedOut = false;
  }

  checkHeartbeatTimeout(nowMs: number): boolean {
    if (!Number.isFinite(nowMs) || nowMs < 0) {
      throw new TypeError("nowMs must be a finite, non-negative timestamp");
    }

    if (
      this.heartbeatDeadlineMs === null ||
      this.heartbeatTimedOut ||
      nowMs < this.heartbeatDeadlineMs
    ) {
      return false;
    }

    this.heartbeatTimedOut = true;
    this.recordConnectionFailure();
    return true;
  }
  recordConnectionFailure(): void {
    this.consecutiveConnectionFailures += 1;
    this.emit({
      type: "disconnected",
      consecutiveFailures: this.consecutiveConnectionFailures,
    });
  }
  recordConnectionSuccess(): void {
    const attemptsBeforeSuccess = this.reconnectAttempts;
    this.consecutiveConnectionFailures = 0;
    this.reconnectAttempts = 0;

    this.emit({ type: "connected" });

    if (attemptsBeforeSuccess > 0) {
      this.emit({
        type: "reconnected",
        reconnectAttempts: attemptsBeforeSuccess,
      });
    }
  }

  recordRecoveryCompleted(): void {
    this.emit({ type: "recovery_completed" });
  }

  getMessagesForRecovery(): OutboxMessage[] {
    return this.getPendingMessages();
  }

  prepareMessagesForRecovery(): OutboxMessage[] {
    const pendingMessages = this.getPendingMessages();

    for (const message of pendingMessages) {
      this.markSendAttempt(message.id);
    }

    return this.getPendingMessages();
  }
  recordReconnectAttempt(): number {
    this.reconnectAttempts += 1;
    const exponent = Math.min(this.reconnectAttempts - 1, 30);
    const capped = Math.min(
      this.reconnectMaxMs,
      this.reconnectBaseMs * 2 ** exponent,
    );
    let networkMultiplier = 1;
    if (this.network === "cellular") networkMultiplier = 1.25;
    if (this.network === "offline") return this.reconnectMaxMs;

    const jitter = Math.min(1, Math.max(0, this.random()));
    const delay = Math.min(this.reconnectMaxMs, capped * networkMultiplier);

    return Math.round(delay * (0.5 + jitter * 0.5));
  }
  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
  }
  setNetwork(network: NetworkType): void {
    this.network = network;
  }
  enqueue(id: string, payload: unknown, now = Date.now()): void {
    if (!id.trim()) throw new TypeError("Message id must be non-empty");
    if (!Number.isFinite(now))
      throw new TypeError("now must be a finite timestamp");
    if (this.acknowledged.has(id) || this.outbox.has(id)) return;
    this.outbox.set(id, {
      id,
      payload,
      createdAt: now,
      attempts: 0,
    });
    this.emit({ type: "intent_queued", intentId: id });
  }
  getPendingMessages(): OutboxMessage[] {
    return [...this.outbox.values()].map((message) => ({ ...message }));
  }

  recordEventReceived(eventId: string): void {
    if (!eventId.trim()) {
      throw new TypeError("Event id must be non-empty");
    }

    this.emit({ type: "event_received", eventId });
  }

  markItemFailed(id: string, reason: string): boolean {
    if (!this.outbox.has(id)) {
      return false;
    }

    this.emit({
      type: "item_failed",
      messageId: id,
      reason,
    });

    return true;
  }
  markSendAttempt(id: string): boolean {
    const message = this.outbox.get(id);
    if (!message) return false;
    message.attempts += 1;
    return true;
  }

  acknowledge(id: string): boolean {
    const existed = this.outbox.delete(id);

    if (existed) {
      this.acknowledged.add(id);
      this.emit({ type: "item_acknowledged", messageId: id });
      return true;
    }

    return this.acknowledged.has(id);
  }

  setForegroundProtection(enabled: boolean): void {
    this.foregroundProtectionEnabled = enabled;
  }
  getMetrics(): ConnectionMetrics {
    return {
      observedDisconnects: this.observedDisconnects,
      reconnectAttempts: this.reconnectAttempts,
      heartbeatsScheduled: this.heartbeatsScheduled,
      queuedMessages: this.outbox.size,
      acknowledgedMessages: this.acknowledged.size,
      currentNetwork: this.network,
      foregroundProtectionEnabled: this.foregroundProtectionEnabled,
      consecutiveConnectionFailures: this.consecutiveConnectionFailures,
      lastHeartbeatRttMs: this.lastHeartbeatRttMs,
    };
  }
}
