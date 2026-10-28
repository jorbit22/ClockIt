import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SimulatedTransactionExecutor,
  TransactionProcessor
} from '../../src/backend-transaction/transaction-processor.js';
import {
  WatchInteractionCoordinator,
  type DoubleTapInput
} from '../../src/watch-interaction/watch-interaction.js';
function setup(now = 1_000) {
  const executor = new SimulatedTransactionExecutor();
  const processor = new TransactionProcessor(executor, () => now);
  const coordinator = new WatchInteractionCoordinator(
    processor,
    () => now
  );
  const input: DoubleTapInput = {
    intentId: 'intent-1',
    userId: 'user-1',
    eventId: 'event-1',
    operation: 'CONFIRM_ACTION',
    parameters: { amount: 100 },
    eventExpiresAt: now + 10_000
  };
  return { executor, processor, coordinator, input };
}
test('valid double-tap submits an intent to the transaction processor', async () => {
  const { executor, coordinator, input } = setup();
  const result = await coordinator.handleDoubleTap(input);
  assert.equal(result.accepted, true);
  if (result.accepted) {
    assert.equal(result.intent.intentId, input.intentId);
    assert.equal(result.intent.eventId, input.eventId);
    assert.equal(result.intent.status, 'SUCCEEDED');
  }
  assert.equal(executor.executeCalls, 1);
});
test('repeated double-tap with the same intent ID does not execute twice', async () => {
  const { executor, coordinator, input } = setup();
  const first = await coordinator.handleDoubleTap(input);
  const second = await coordinator.handleDoubleTap(input);
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  if (first.accepted && second.accepted) {
    assert.equal(first.intent.intentId, second.intent.intentId);
    assert.equal(first.intent.status, second.intent.status);
  }
  assert.equal(executor.executeCalls, 1);
});
test('reusing an intent ID with different parameters is rejected', async () => {
  const { coordinator, input } = setup();
  await coordinator.handleDoubleTap(input);
  await assert.rejects(
    coordinator.handleDoubleTap({
      ...input,
      parameters: { amount: 999 }
    }),
    /INTENT_ID_CONFLICT/
  );
});
test('expired event cannot create a new transaction intent', async () => {
  const { executor, coordinator, input } = setup();
  const result = await coordinator.handleDoubleTap({
    ...input,
    eventExpiresAt: 1_000
  });
  assert.deepEqual(result, {
    accepted: false,
    reason: 'EVENT_EXPIRED'
  });
  assert.equal(executor.executeCalls, 0);
});
test('retry can retrieve an existing intent after its event expires', async () => {
  const { executor, coordinator, input } = setup();
  const first = await coordinator.handleDoubleTap(input);
  const retry = await coordinator.handleDoubleTap({
    ...input,
    eventExpiresAt: 1_000
  });
  assert.equal(first.accepted, true);
  assert.equal(retry.accepted, true);
  if (first.accepted && retry.accepted) {
    assert.equal(retry.intent.intentId, first.intent.intentId);
    assert.equal(retry.intent.status, first.intent.status);
  }
  assert.equal(executor.executeCalls, 1);
});
