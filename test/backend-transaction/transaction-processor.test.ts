import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SimulatedTransactionExecutor,
  TransactionProcessor,
  type TransactionIntentInput
} from '../../src/backend-transaction/transaction-processor.ts';
function request(overrides: Partial<TransactionIntentInput> = {}): TransactionIntentInput {
  return {
    intentId: 'intent-001',
    userId: 'user-001',
    eventId: 'event-001',
    operation: 'SIMULATED_TRANSFER',
    parameters: { amount: 500, currency: 'NGN' },
    ...overrides
  };
}
test('a valid intent reaches a confirmed simulated success', async () => {
  const executor = new SimulatedTransactionExecutor();
  const processor = new TransactionProcessor(executor);
  const result = await processor.submit(request());
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.executionId, 'execution-intent-001');
  assert.equal(executor.executeCalls, 1);
});
test('repeated concurrent submissions execute one logical intent', async () => {
  const executor = new SimulatedTransactionExecutor();
  const processor = new TransactionProcessor(executor);
  const [first, second] = await Promise.all([
    processor.submit(request()),
    processor.submit(request())
  ]);
  assert.equal(first.status, 'SUCCEEDED');
  assert.equal(second.status, 'SUCCEEDED');
  assert.equal(executor.executeCalls, 1);
});
test('reusing an intent ID with different parameters is rejected', async () => {
  const executor = new SimulatedTransactionExecutor();
  const processor = new TransactionProcessor(executor);
  await processor.submit(request());
  assert.throws(
    () => processor.submit(request({
      parameters: { amount: 900, currency: 'NGN' }
    })),
    /INTENT_ID_CONFLICT/
  );
  assert.equal(executor.executeCalls, 1);
});
test('a confirmed executor failure is not reported as success', async () => {
  const executor = new SimulatedTransactionExecutor();
  executor.setNextMode('failure');
  const processor = new TransactionProcessor(executor);
  const result = await processor.submit(request());
  assert.equal(result.status, 'FAILED');
  assert.equal(result.outcome, 'SIMULATED_FAILURE');
});
test('lost execution response stays unknown until the original execution is reconciled', async () => {
  const executor = new SimulatedTransactionExecutor();
  executor.setNextMode('response-lost');
  const processor = new TransactionProcessor(executor);
  const submitted = await processor.submit(request());
  assert.equal(submitted.status, 'OUTCOME_UNKNOWN');
  assert.equal(executor.executeCalls, 1);
  const recovered = await processor.reconcile('intent-001');
  assert.equal(recovered.status, 'SUCCEEDED');
  assert.equal(recovered.executionId, 'execution-intent-001');
  assert.equal(executor.executeCalls, 1);
});
test('outcome communication can be retried without repeating execution', async () => {
  const executor = new SimulatedTransactionExecutor();
  const processor = new TransactionProcessor(executor);
  await processor.submit(request());
  let deliveryAttempts = 0;
  const failOnce = async () => {
    deliveryAttempts += 1;
    if (deliveryAttempts === 1) throw new Error('SIMULATED_DELIVERY_FAILURE');
  };
  await assert.rejects(
    processor.communicateOutcome('intent-001', failOnce),
    /SIMULATED_DELIVERY_FAILURE/
  );
  assert.equal(
    await processor.communicateOutcome('intent-001', failOnce),
    true
  );
  assert.equal(deliveryAttempts, 2);
  assert.equal(executor.executeCalls, 1);
  assert.equal(processor.get('intent-001')?.status, 'SUCCEEDED');
});
test('unknown intent cannot be reconciled into a fabricated result', async () => {
  const executor = new SimulatedTransactionExecutor();
  const processor = new TransactionProcessor(executor);
  await assert.rejects(
    processor.reconcile('missing-intent'),
    /INTENT_NOT_FOUND/
  );
});
