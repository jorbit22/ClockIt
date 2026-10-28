import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveConnectionManager } from '../../src/connection-manager/adaptive-connection-manager.ts';
test('learns an idle timeout using an exponential moving average', () => {
  const manager = new AdaptiveConnectionManager({
    initialIdleTimeoutMs: 60_000,
    minIdleTimeoutMs: 10_000,
    maxIdleTimeoutMs: 120_000,
    emaAlpha: 0.5
  });
  assert.equal(manager.observeIdleDisconnect(40_000), 50_000);
  assert.equal(manager.observeIdleDisconnect(30_000), 40_000);
});
test('clamps learned timeout to configured bounds', () => {
  const manager = new AdaptiveConnectionManager({
    initialIdleTimeoutMs: 60_000,
    minIdleTimeoutMs: 20_000,
    maxIdleTimeoutMs: 80_000,
    emaAlpha: 1
  });
  assert.equal(manager.observeIdleDisconnect(1), 20_000);
  assert.equal(manager.observeIdleDisconnect(500_000), 80_000);
});
test('heartbeat uses configured ratio and bounded jitter', () => {
  const manager = new AdaptiveConnectionManager({
    initialIdleTimeoutMs: 100_000,
    heartbeatRatio: 0.8,
    random: () => 0.5
  });
  assert.equal(manager.getHeartbeatDelayMs(), 80_000);
  assert.equal(manager.getMetrics().heartbeatsScheduled, 1);
});
test('reconnect delay grows exponentially but stays capped', () => {
  const manager = new AdaptiveConnectionManager({
    reconnectBaseMs: 1_000,
    reconnectMaxMs: 5_000,
    random: () => 1
  });
  assert.equal(manager.recordReconnectAttempt(), 1_000);
  assert.equal(manager.recordReconnectAttempt(), 2_000);
  assert.equal(manager.recordReconnectAttempt(), 4_000);
  assert.equal(manager.recordReconnectAttempt(), 5_000);
});
test('cellular reconnect delay accounts for a slower network and remains capped', () => {
  const manager = new AdaptiveConnectionManager({
    reconnectBaseMs: 1_000,
    reconnectMaxMs: 5_000,
    random: () => 1
  });
  manager.setNetwork('cellular');
  assert.equal(manager.recordReconnectAttempt(), 1_250);
  assert.equal(manager.getMetrics().currentNetwork, 'cellular');
  manager.setNetwork('offline');
  assert.equal(manager.recordReconnectAttempt(), 5_000);
});
test('outbox deduplicates message IDs and removes acknowledged messages', () => {
  const manager = new AdaptiveConnectionManager();
  manager.enqueue('message-1', { value: 1 }, 100);
  manager.enqueue('message-1', { value: 2 }, 200);
  assert.equal(manager.getPendingMessages().length, 1);
  assert.equal(manager.markSendAttempt('message-1'), true);
  assert.equal(manager.getPendingMessages()[0].attempts, 1);
  assert.equal(manager.acknowledge('message-1'), true);
  assert.equal(manager.getPendingMessages().length, 0);
  // Acknowledged IDs cannot be re-enqueued during this process lifetime.
  manager.enqueue('message-1', { value: 3 }, 300);
  assert.equal(manager.getPendingMessages().length, 0);
  assert.equal(manager.getMetrics().acknowledgedMessages, 1);
});
test('foreground protection can be toggled and metrics report the state', () => {
  const manager = new AdaptiveConnectionManager();
  manager.setForegroundProtection(true);
  assert.equal(manager.getMetrics().foregroundProtectionEnabled, true);
  manager.setForegroundProtection(false);
  assert.equal(manager.getMetrics().foregroundProtectionEnabled, false);
});
test('invalid observations and settings are rejected', () => {
  const manager = new AdaptiveConnectionManager();
  assert.throws(() => manager.observeIdleDisconnect(0));
  assert.throws(() => manager.enqueue('', {}));
  assert.throws(() => new AdaptiveConnectionManager({ heartbeatRatio: 0.5 }));
});

test('heartbeat jitter never exceeds the 70–85 percent design bounds', () => {
  const early = new AdaptiveConnectionManager({
    initialIdleTimeoutMs: 100_000,
    heartbeatRatio: 0.7,
    random: () => 0
  });
  const late = new AdaptiveConnectionManager({
    initialIdleTimeoutMs: 100_000,
    heartbeatRatio: 0.85,
    random: () => 1
  });
  assert.equal(early.getHeartbeatDelayMs(), 70_000);
  assert.equal(late.getHeartbeatDelayMs(), 85_000);
});
