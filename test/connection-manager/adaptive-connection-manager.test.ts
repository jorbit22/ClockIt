import test from "node:test";
import assert from "node:assert/strict";
import {
  AdaptiveConnectionManager,
  type ConnectionManagerEvent,
} from "../../src/connection-manager/adaptive-connection-manager.ts";
test("learns an idle timeout using an exponential moving average", () => {
  const manager = new AdaptiveConnectionManager({
    initialIdleTimeoutMs: 60_000,
    minIdleTimeoutMs: 10_000,
    maxIdleTimeoutMs: 120_000,
    emaAlpha: 0.5,
  });
  assert.equal(manager.observeIdleDisconnect(40_000), 50_000);
  assert.equal(manager.observeIdleDisconnect(30_000), 40_000);
});
test("clamps learned timeout to configured bounds", () => {
  const manager = new AdaptiveConnectionManager({
    initialIdleTimeoutMs: 60_000,
    minIdleTimeoutMs: 20_000,
    maxIdleTimeoutMs: 80_000,
    emaAlpha: 1,
  });
  assert.equal(manager.observeIdleDisconnect(1), 20_000);
  assert.equal(manager.observeIdleDisconnect(500_000), 80_000);
});
test("heartbeat uses configured ratio and bounded jitter", () => {
  const manager = new AdaptiveConnectionManager({
    initialIdleTimeoutMs: 100_000,
    heartbeatRatio: 0.8,
    random: () => 0.5,
  });
  assert.equal(manager.getHeartbeatDelayMs(), 80_000);
  assert.equal(manager.getMetrics().heartbeatsScheduled, 1);
});
test("reconnect delay grows exponentially but stays capped", () => {
  const manager = new AdaptiveConnectionManager({
    reconnectBaseMs: 1_000,
    reconnectMaxMs: 5_000,
    random: () => 1,
  });
  assert.equal(manager.recordReconnectAttempt(), 1_000);
  assert.equal(manager.recordReconnectAttempt(), 2_000);
  assert.equal(manager.recordReconnectAttempt(), 4_000);
  assert.equal(manager.recordReconnectAttempt(), 5_000);
});
test("cellular reconnect delay accounts for a slower network and remains capped", () => {
  const manager = new AdaptiveConnectionManager({
    reconnectBaseMs: 1_000,
    reconnectMaxMs: 5_000,
    random: () => 1,
  });
  manager.setNetwork("cellular");
  assert.equal(manager.recordReconnectAttempt(), 1_250);
  assert.equal(manager.getMetrics().currentNetwork, "cellular");
  manager.setNetwork("offline");
  assert.equal(manager.recordReconnectAttempt(), 5_000);
});
test("outbox deduplicates message IDs and removes acknowledged messages", () => {
  const manager = new AdaptiveConnectionManager();
  manager.enqueue("message-1", { value: 1 }, 100);
  manager.enqueue("message-1", { value: 2 }, 200);
  assert.equal(manager.getPendingMessages().length, 1);
  assert.equal(manager.markSendAttempt("message-1"), true);
  assert.equal(manager.getPendingMessages()[0].attempts, 1);
  assert.equal(manager.acknowledge("message-1"), true);
  assert.equal(manager.getPendingMessages().length, 0);
  // Acknowledged IDs cannot be re-enqueued during this process lifetime.
  manager.enqueue("message-1", { value: 3 }, 300);
  assert.equal(manager.getPendingMessages().length, 0);
  assert.equal(manager.getMetrics().acknowledgedMessages, 1);
});
test("foreground protection can be toggled and metrics report the state", () => {
  const manager = new AdaptiveConnectionManager();
  manager.setForegroundProtection(true);
  assert.equal(manager.getMetrics().foregroundProtectionEnabled, true);
  manager.setForegroundProtection(false);
  assert.equal(manager.getMetrics().foregroundProtectionEnabled, false);
});
test("invalid observations and settings are rejected", () => {
  const manager = new AdaptiveConnectionManager();
  assert.throws(() => manager.observeIdleDisconnect(0));
  assert.throws(() => manager.enqueue("", {}));
  assert.throws(() => new AdaptiveConnectionManager({ heartbeatRatio: 0.5 }));
});

test("heartbeat jitter never exceeds the 70�85 percent design bounds", () => {
  const early = new AdaptiveConnectionManager({
    initialIdleTimeoutMs: 100_000,
    heartbeatRatio: 0.7,
    random: () => 0,
  });
  const late = new AdaptiveConnectionManager({
    initialIdleTimeoutMs: 100_000,
    heartbeatRatio: 0.85,
    random: () => 1,
  });
  assert.equal(early.getHeartbeatDelayMs(), 70_000);
  assert.equal(late.getHeartbeatDelayMs(), 85_000);
});
test("reports consecutive connection failures and last heartbeat RTT", () => {
  const manager = new AdaptiveConnectionManager();
  const metrics = manager.getMetrics() as ReturnType<
    typeof manager.getMetrics
  > & {
    consecutiveConnectionFailures?: number;
    lastHeartbeatRttMs?: number | null;
  };
  assert.equal(metrics.consecutiveConnectionFailures, 0);
  assert.equal(metrics.lastHeartbeatRttMs, null);
});
test("updates heartbeat RTT and resets consecutive failures on success", () => {
  const manager = new AdaptiveConnectionManager();
  manager.recordConnectionFailure();
  manager.recordConnectionFailure();
  manager.recordHeartbeatRtt(125);
  assert.equal(manager.getMetrics().consecutiveConnectionFailures, 2);
  assert.equal(manager.getMetrics().lastHeartbeatRttMs, 125);
  manager.recordConnectionSuccess();
  assert.equal(manager.getMetrics().consecutiveConnectionFailures, 0);
  assert.equal(manager.getMetrics().lastHeartbeatRttMs, 125);
});
test("detects a silent connection failure when heartbeat response times out", () => {
  const manager = new AdaptiveConnectionManager({
    initialIdleTimeoutMs: 100_000,
    heartbeatRatio: 0.8,
    random: () => 0.5,
  });
  manager.recordHeartbeatSent(10_000);
  assert.equal(manager.checkHeartbeatTimeout(89_999), false);
  assert.equal(manager.checkHeartbeatTimeout(90_000), true);
  assert.equal(manager.checkHeartbeatTimeout(91_000), false);
  assert.equal(manager.getMetrics().consecutiveConnectionFailures, 1);
  manager.recordHeartbeatRtt(125);
  assert.equal(manager.checkHeartbeatTimeout(100_000), false);
});

test("emits lifecycle events and stops notifying after unsubscribe", () => {
  const manager = new AdaptiveConnectionManager();
  const events: string[] = [];
  const unsubscribe = manager.onEvent((event) => {
    events.push(event.type);
  });
  manager.recordConnectionFailure();
  manager.recordConnectionSuccess();
  manager.recordEventReceived("event-1");
  manager.enqueue("intent-1", { amount: 100 }, 1);
  manager.acknowledge("intent-1");
  unsubscribe();
  manager.recordConnectionFailure();
  assert.deepEqual(events, [
    "disconnected",
    "connected",
    "event_received",
    "intent_queued",
    "item_acknowledged",
  ]);
});
test("reports item failure without removing it from the outbox", () => {
  const manager = new AdaptiveConnectionManager();
  const events: Array<{ type: string; messageId?: string; reason?: string }> =
    [];
  manager.onEvent((event) => {
    events.push(event);
  });
  manager.enqueue("message-1", { value: "test" }, 1);
  assert.equal(
    manager.markItemFailed("message-1", "temporary transport error"),
    true,
  );
  assert.equal(manager.getPendingMessages().length, 1);
  assert.deepEqual(events.at(-1), {
    type: "item_failed",
    messageId: "message-1",
    reason: "temporary transport error",
  });
  assert.equal(manager.markItemFailed("missing-message", "failed"), false);
});

test("emits reconnection and recovery events after a recorded reconnect", () => {
  const manager = new AdaptiveConnectionManager();
  const events: string[] = [];

  manager.onEvent((event) => {
    events.push(event.type);
  });

  manager.recordReconnectAttempt();
  manager.recordConnectionSuccess();

  assert.deepEqual(events, ["connected", "reconnected"]);

  manager.recordRecoveryCompleted();

  assert.deepEqual(events, ["connected", "reconnected", "recovery_completed"]);
});

test("ignores unreliable or incomplete idle-timeout observations", () => {
  const manager = new AdaptiveConnectionManager({
    initialIdleTimeoutMs: 60_000,
    emaAlpha: 0.5,
  });

  assert.equal(
    manager.observeIdleDisconnect(5_000, { reliable: false }),
    60_000,
  );

  assert.equal(
    manager.observeIdleDisconnect(5_000, { complete: false }),
    60_000,
  );

  assert.equal(manager.getLearnedIdleTimeoutMs(), 60_000);
  assert.equal(manager.getMetrics().observedDisconnects, 0);

  assert.equal(manager.observeIdleDisconnect(40_000), 50_000);
  assert.equal(manager.getMetrics().observedDisconnects, 1);
});

test("reconnect delay remains bounded when jitter source returns zero", () => {
  const manager = new AdaptiveConnectionManager({
    reconnectBaseMs: 1_000,
    reconnectMaxMs: 5_000,
    random: () => 0,
  });

  assert.equal(manager.recordReconnectAttempt(), 500);
});

test("reconnected event reports the actual reconnect attempts", () => {
  const manager = new AdaptiveConnectionManager();
  const events: ConnectionManagerEvent[] = [];

  manager.onEvent((event) => events.push(event));

  manager.recordReconnectAttempt();
  manager.recordReconnectAttempt();
  manager.recordConnectionSuccess();

  const reconnected = events.find((event) => event.type === "reconnected");

  assert.deepEqual(reconnected, {
    type: "reconnected",
    reconnectAttempts: 2,
  });

  assert.equal(
    events.some((event) => event.type === "recovery_completed"),
    false,
  );
});

test("recovery completion is emitted only when explicitly recorded", () => {
  const manager = new AdaptiveConnectionManager();
  const events: ConnectionManagerEvent[] = [];

  manager.onEvent((event) => events.push(event));

  manager.recordReconnectAttempt();
  manager.recordConnectionSuccess();

  assert.equal(
    events.some((event) => event.type === "recovery_completed"),
    false,
  );

  manager.recordRecoveryCompleted();

  assert.equal(
    events.filter((event) => event.type === "recovery_completed").length,
    1,
  );
});

test("pending messages remain available for recovery until acknowledged", () => {
  const manager = new AdaptiveConnectionManager();

  manager.enqueue("intent-1", { amount: 100 }, 100);

  const recoveryMessages = manager.getMessagesForRecovery();

  assert.equal(recoveryMessages.length, 1);
  assert.equal(recoveryMessages[0].id, "intent-1");
  assert.equal(manager.getPendingMessages().length, 1);

  manager.markSendAttempt("intent-1");

  assert.equal(manager.getMessagesForRecovery()[0].attempts, 1);

  manager.acknowledge("intent-1");

  assert.equal(manager.getMessagesForRecovery().length, 0);
});

test("new heartbeat scheduling uses the updated learned idle timeout", () => {
  const manager = new AdaptiveConnectionManager({
    initialIdleTimeoutMs: 60_000,
    minIdleTimeoutMs: 10_000,
    maxIdleTimeoutMs: 120_000,
    emaAlpha: 1,
    heartbeatRatio: 0.8,
    random: () => 0.5,
  });

  manager.recordHeartbeatSent(1_000);
  assert.equal(manager.checkHeartbeatTimeout(48_999), false);

  manager.observeIdleDisconnect(100_000);
  manager.recordHeartbeatSent(50_000);

  assert.equal(manager.checkHeartbeatTimeout(129_999), false);
  assert.equal(manager.checkHeartbeatTimeout(130_000), true);
});
