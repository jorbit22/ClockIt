import { createEvent } from './event-source/event-source.ts';
import { InMemoryDeliveryService } from './backend-delivery/delivery-service.ts';
import { EventDeliveryPipeline } from './backend-delivery/event-delivery-pipeline.ts';
import { AdaptiveConnectionManager } from './connection-manager/adaptive-connection-manager.ts';
import {
  SimulatedTransactionExecutor,
  TransactionProcessor
} from './backend-transaction/transaction-processor.ts';
import {
  InMemoryWatchEventStore,
  PhoneWatchRelay,
  SimulatedWatchTransport,
  type RelayEvent
} from './phone-watch-relay/phone-watch-relay.ts';
import { WatchInteractionCoordinator } from './watch-interaction/watch-interaction.ts';
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
        console.log(
          `Transport sent event "${receivedEvent.id}" to device "${delivery.deviceId}".`
        );
        sentDevices.push(delivery.deviceId);
      }
    },
    15_000,
    1_000
  );
  console.log('\nCLOCKIT END-TO-END SIMULATION');
  console.log('\n1. Create event:', event.id);
  const eventExpiresAt = Date.now() + 60_000;
  const deliveryResults = await pipeline.publish(
    event,
    [
      { recipientId: 'demo-user', deviceId: 'demo-phone-001' },
      { recipientId: 'demo-user', deviceId: 'demo-phone-002' }
    ],
    eventExpiresAt
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
  console.log('\n3. Relay the event from phone to simulated watch');
  const watch = new InMemoryWatchEventStore();
  const watchTransport = new SimulatedWatchTransport(watch);
  const relay = new PhoneWatchRelay(
    watchTransport,
    Date.now,
    5
  );
  const relayEvent: RelayEvent = {
    eventId: event.id,
    createdAt: Date.now(),
    expiresAt: eventExpiresAt,
    payload: {
      source: event.source,
      type: event.type,
      subject: event.subject,
      data: event.data
    }
  };
  relay.queue(relayEvent);
  const relayResult = await relay.deliver(event.id);
  console.log('Watch relay status:', relayResult.status);
  console.log('Relay attempts:', relayResult.attemptCount);
  console.log('Events stored on simulated watch:', watch.count());
  console.log('\n4. Simulate watch double-tap and transaction processing');
  const executor = new SimulatedTransactionExecutor();
  const processor = new TransactionProcessor(executor);
  const interaction = new WatchInteractionCoordinator(processor);
  executor.setNextMode('response-lost');
  const interactionResult = await interaction.handleDoubleTap({
    intentId: 'demo-intent-001',
    userId: 'demo-user',
    eventId: event.id,
    operation: 'SIMULATED_TRANSFER',
    parameters: { amount: 500, currency: 'NGN' },
    eventExpiresAt: relayEvent.expiresAt
  });
  if (!interactionResult.accepted) {
    throw new Error(
      `Watch action was not accepted: ${interactionResult.reason}`
    );
  }
  console.log('Double-tap accepted:', interactionResult.accepted);
  console.log('Initial transaction status:', interactionResult.intent.status);
  console.log('Execution calls so far:', executor.executeCalls);
  console.log('\n5. Reconcile the original execution');
  const recovered = await processor.reconcile('demo-intent-001');
  console.log('Reconciled status:', recovered.status);
  console.log('Execution ID:', recovered.executionId);
  console.log('Execution calls after reconciliation:', executor.executeCalls);
  console.log('\n6. Communicate the recorded outcome');
  await processor.communicateOutcome('demo-intent-001', async intent => {
    console.log(`Outcome delivered: ${intent.status} (${intent.outcome})`);
  });
  console.log('\n7. Connection manager sample');
  console.log(
    `Heartbeat interval: ${connectionManager.getHeartbeatDelayMs()} ms`
  );
  console.log(
    `Next reconnect delay: ${connectionManager.recordReconnectAttempt()} ms`
  );
  console.log('\nDEMO COMPLETE');
  console.log(
    'Limitations: phone transport, watch storage, watch interaction, and transaction execution are simulated.'
  );
  console.log(
    'State is held in memory; real Bluetooth, physical gestures, process-restart durability, and live financial execution are not implemented.'
  );
}
main().catch(error => {
  console.error('Demo failed:', error);
  process.exitCode = 1;
});
