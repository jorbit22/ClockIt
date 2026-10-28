import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvent } from '../../src/event-source/event-source.ts';
import { InMemoryDeliveryService } from '../../src/backend-delivery/delivery-service.ts';
import { EventDeliveryPipeline } from '../../src/backend-delivery/event-delivery-pipeline.ts';
test('event pipeline sends the event payload to each intended device', async () => {
  const service = new InMemoryDeliveryService({ now: () => 1_000 });
  const received: Array<{ eventId: string; deviceId: string; data: unknown }> = [];
  const pipeline = new EventDeliveryPipeline(service, {
    async send(event, delivery) {
      received.push({
        eventId: event.id,
        deviceId: delivery.deviceId,
        data: event.data
      });
    }
  });
  const event = createEvent({
    id: 'event-pipeline-1',
    source: 'clockit.test',
    type: 'clockit.example.alert',
    occurredAt: '2026-10-28T08:00:00.000Z',
    data: { message: 'Example alert', amount: 250 }
  });
  const results = await pipeline.publish(event, [
    { recipientId: 'user-1', deviceId: 'phone-1' },
    { recipientId: 'user-1', deviceId: 'phone-2' }
  ], 10_000);
  assert.equal(results.length, 2);
  assert.ok(results.every(item => item.result.outcome === 'SENT_AWAITING_ACK'));
  assert.deepEqual(
    received.map(item => item.deviceId),
    ['phone-1', 'phone-2']
  );
  assert.ok(received.every(item => item.eventId === event.id));
  assert.deepEqual(received[0].data, {
    message: 'Example alert',
    amount: 250
  });
  assert.equal(service.list().length, 2);
});
test('republishing an acknowledged event does not send it again to that device', async () => {
  const service = new InMemoryDeliveryService({ now: () => 1_000 });
  let sends = 0;
  const pipeline = new EventDeliveryPipeline(service, {
    async send() {
      sends += 1;
    }
  });
  const event = createEvent({
    id: 'event-pipeline-2',
    source: 'clockit.test',
    type: 'clockit.example.alert',
    occurredAt: '2026-10-28T08:00:00.000Z',
    data: { message: 'Example alert' }
  });
  const target = [{ recipientId: 'user-1', deviceId: 'phone-1' }];
  await pipeline.publish(event, target, 10_000);
  assert.equal(
    service.acknowledgePhoneStored(event.id, 'phone-1', 'phone-1'),
    true
  );
  const repeated = await pipeline.publish(event, target, 10_000);
  assert.equal(sends, 1);
  assert.equal(repeated[0].result.outcome, 'NOT_CLAIMED');
  assert.equal(service.get(event.id, 'phone-1')?.status, 'PHONE_STORED');
});
