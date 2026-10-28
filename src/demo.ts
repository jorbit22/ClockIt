import { createEvent } from './event-source/event-source.ts';
import { InMemoryDeliveryService } from './backend-delivery/delivery-service.ts';
import { EventDeliveryPipeline } from './backend-delivery/event-delivery-pipeline.ts';
import { AdaptiveConnectionManager } from './connection-manager/adaptive-connection-manager.ts';
import {
  SimulatedTransactionExecutor,
  TransactionProcessor
} from './backend-transaction/transaction-processor.ts';
async function main(): Promise<void> {
  const event = createEvent({
    id: 'demo-event-001',
    source: 'clockit/demo',
    type: 'clockit.event.demo',
    occurredAt: new Date().toISOString(),
    subject: 'demo-transaction',
    data: {
      message: 'A sample Clockit event reached the delivery pipeline.',
      demo: true
    }
  });
  const deliveryService = new InMemoryDeliveryService();
  const connectionManager = new AdaptiveConnectionManager({
    initialIdleTimeoutMs: 120_000,
    random: () => 0.5
  });
  const sentDevices: string[] = [];
  const pipeline = new EventDeliveryPipeline(
    deliveryService,
    {
      async send(receivedEvent, delivery) {
        console.log(`Transport sent event "${receivedEvent.id}" to device "${delivery.deviceId}".`);
        sentDevices.push(delivery.deviceId);
      }
    },
    15_000,
    1_000
  );
  console.log('\nCLOCKIT END-TO-END SIMULATION');
  console.log('\n1. Create event:', event.id);
  const deliveryResults = await pipeline.publish(
    event,
    [
      { recipientId: 'demo-user', deviceId: 'demo-phone-001' },
      { recipientId: 'demo-user', deviceId: 'demo-phone-002' }
    ],
    Date.now() + 60_000
  );
  console.log('Delivery dispatch results:');
  console.log(JSON.stringify(deliveryResults, null, 2));
  console.log('\n2. Simulate phone receipt acknowledgments');
  for (const deviceId of sentDevices) {
    deliveryService.acknowledgePhoneStored(
      event.id,
      deviceId,
      deviceId
    );
  }
  console.log(JSON.stringify(deliveryService.list(), null, 2));
  console.log('\n3. Process a transaction intent');
  const executor = new SimulatedTransactionExecutor();
  const processor = new TransactionProcessor(executor);
  executor.setNextMode('response-lost');
  const uncertain = await processor.submit({
    intentId: 'demo-intent-001',
    userId: 'demo-user',
    eventId: event.id,
    operation: 'SIMULATED_TRANSFER',
    parameters: { amount: 500, currency: 'NGN' }
  });
  console.log('Initial transaction status:', uncertain.status);
  console.log('Execution calls so far:', executor.executeCalls);
  console.log('\n4. Reconcile the original execution');
  const recovered = await processor.reconcile('demo-intent-001');
  console.log('Reconciled status:', recovered.status);
  console.log('Execution ID:', recovered.executionId);
  console.log('Execution calls after reconciliation:', executor.executeCalls);
  console.log('\n5. Communicate the recorded outcome');
  await processor.communicateOutcome('demo-intent-001', async intent => {
    console.log(`Outcome delivered: ${intent.status} (${intent.outcome})`);
  });
  console.log('\n6. Connection manager sample');
  console.log(`Heartbeat interval: ${connectionManager.getHeartbeatDelayMs()} ms`);
  console.log(`Next reconnect delay: ${connectionManager.recordReconnectAttempt()} ms`);
  console.log('\nDEMO COMPLETE');
  console.log('Limitations: transport, phone receipt, and transaction execution are simulated.');
  console.log('Intent and delivery state are in memory; process-restart durability is not implemented.');
}
main().catch(error => {
  console.error('Demo failed:', error);
  process.exitCode = 1;
});
