export type NetworkType = 'wifi' | 'cellular' | 'unknown' | 'offline';
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
}
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
  private network: NetworkType = 'unknown';
  private foregroundProtectionEnabled = false;
  private readonly outbox = new Map<string, OutboxMessage>();
  private readonly acknowledged = new Set<string>();
  private observedDisconnects = 0;
  private reconnectAttempts = 0;
  private heartbeatsScheduled = 0;
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
      throw new TypeError('Invalid idle timeout bounds');
    }
    if (this.emaAlpha <= 0 || this.emaAlpha > 1) {
      throw new TypeError('emaAlpha must be greater than 0 and at most 1');
    }
    if (this.heartbeatRatio < 0.7 || this.heartbeatRatio > 0.85) {
      throw new TypeError('heartbeatRatio must be between 0.7 and 0.85');
    }
    if (
      this.reconnectBaseMs <= 0 ||
      this.reconnectMaxMs < this.reconnectBaseMs
    ) {
      throw new TypeError('Invalid reconnect delay bounds');
    }
    if (this.idleTimeoutMs < this.minIdleTimeoutMs ||
        this.idleTimeoutMs > this.maxIdleTimeoutMs) {
      throw new TypeError('Initial idle timeout must be within configured bounds');
    }
  }
  observeIdleDisconnect(observedIdleMs: number): number {
    if (!Number.isFinite(observedIdleMs) || observedIdleMs <= 0) {
      throw new TypeError('observedIdleMs must be positive');
    }
    this.idleTimeoutMs = Math.min(
      this.maxIdleTimeoutMs,
      Math.max(
        this.minIdleTimeoutMs,
        this.idleTimeoutMs +
          this.emaAlpha * (observedIdleMs - this.idleTimeoutMs)
      )
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
      Math.max(0.7, this.heartbeatRatio * jitterFactor)
    );
    this.heartbeatsScheduled += 1;
    return Math.round(this.idleTimeoutMs * boundedRatio);
  }
  recordReconnectAttempt(): number {
    this.reconnectAttempts += 1;
    const exponent = Math.min(this.reconnectAttempts - 1, 30);
    const capped = Math.min(
      this.reconnectMaxMs,
      this.reconnectBaseMs * 2 ** exponent
    );
    // Full jitter: random delay between zero and the capped backoff.
    let networkMultiplier = 1;
    if (this.network === 'cellular') networkMultiplier = 1.25;
    if (this.network === 'offline') return this.reconnectMaxMs;
    return Math.round(
      Math.min(this.reconnectMaxMs, capped * networkMultiplier) *
      this.random()
    );
  }
  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
  }
  setNetwork(network: NetworkType): void {
    this.network = network;
  }
  enqueue(id: string, payload: unknown, now = Date.now()): void {
    if (!id.trim()) throw new TypeError('Message id must be non-empty');
    if (!Number.isFinite(now)) throw new TypeError('now must be a finite timestamp');
    if (this.acknowledged.has(id) || this.outbox.has(id)) return;
    this.outbox.set(id, {
      id,
      payload,
      createdAt: now,
      attempts: 0
    });
  }
  getPendingMessages(): OutboxMessage[] {
    return [...this.outbox.values()].map(message => ({ ...message }));
  }
  markSendAttempt(id: string): boolean {
    const message = this.outbox.get(id);
    if (!message) return false;
    message.attempts += 1;
    return true;
  }
  acknowledge(id: string): boolean {
    const existed = this.outbox.delete(id);
    if (existed) this.acknowledged.add(id);
    return existed || this.acknowledged.has(id);
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
      foregroundProtectionEnabled: this.foregroundProtectionEnabled
    };
  }
}
