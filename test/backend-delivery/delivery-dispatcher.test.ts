import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryDeliveryService } from '../../src/backend-delivery/delivery-service.ts';
import { DeliveryDispatcher } from '../../src/backend-delivery/delivery-dispatcher.ts';
test('successful transport send waits for phone receipt acknowledgment', async () => {
  let now = 1_000;
  const service = new InMemoryDeliveryService({ now: () => now });
  service.createOrGet({
    eventId: 'event-1',
    deviceId: 'phone-1',
    recipientId: 'user-1',
    expiresAt: 10_000
  });
  let sends = 0;
  const dispatcher = new DeliveryDispatcher(service, {
    async send(record) {
      sends += 1;
      assert.equal(record.eventId, 'event-1');
    }
  });
  const result = await dispatcher.dispatch('event-1', 'phone-1');
  assert.equal(result.outcome, 'SENT_AWAITING_ACK');
  assert.equal(sends, 1);
  assert.equal(service.get('event-1', 'phone-1')?.status, 'IN_FLIGHT');
  assert.equal(
    service.acknowledgePhoneStored('event-1', 'phone-1', 'phone-1'),
    true
  );
  assert.equal(service.get('event-1', 'phone-1')?.status, 'PHONE_STORED');
  now += 1;
});
test('transport failure schedules a retry instead of confirming delivery', async () => {
  let now = 1_000;
  const service = new InMemoryDeliveryService({ now: () => now });
  service.createOrGet({
    eventId: 'event-2',
    deviceId: 'phone-1',
    recipientId: 'user-1',
    expiresAt: 10_000
  });
  const dispatcher = new DeliveryDispatcher(service, {
    async send() {
      throw new Error('simulated network failure');
    }
  }, 15_000, 500);
  const result = await dispatcher.dispatch('event-2', 'phone-1');
  assert.equal(result.outcome, 'RETRY_SCHEDULED');
  assert.equal(service.get('event-2', 'phone-1')?.status, 'PENDING');
  now += 500;
  assert.equal(
    service.claim('event-2', 'phone-1', 15_000)?.status,
    'IN_FLIGHT'
  );
});
test('dispatcher does not send an event that has expired', async () => {
  let now = 1_000;
  const service = new InMemoryDeliveryService({ now: () => now });
  service.createOrGet({
    eventId: 'event-3',
    deviceId: 'phone-1',
    recipientId: 'user-1',
    expiresAt: 1_100
  });
  let sends = 0;
  const dispatcher = new DeliveryDispatcher(service, {
    async send() {
      sends += 1;
    }
  });
  now = 1_100;
  const result = await dispatcher.dispatch('event-3', 'phone-1');
  assert.equal(result.outcome, 'NOT_CLAIMED');
  assert.equal(sends, 0);
  assert.equal(service.get('event-3', 'phone-1')?.status, 'EXPIRED');
});
