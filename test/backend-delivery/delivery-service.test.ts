import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryDeliveryService } from '../../src/backend-delivery/delivery-service.ts';
function setup(maxAttempts = 3) {
  let now = 1_000;
  const service = new InMemoryDeliveryService({
    now: () => now,
    maxAttempts
  });
  const create = (eventId = 'event-1', deviceId = 'phone-1', expiresAt = 10_000) =>
    service.createOrGet({ eventId, deviceId, recipientId: 'user-1', expiresAt });
  return { service, create, advance: (ms: number) => { now += ms; } };
}
test('duplicate publication reuses one logical delivery per event and device', () => {
  const { service, create } = setup();
  create();
  create();
  create('event-1', 'phone-2');
  assert.equal(service.list().length, 2);
});
test('claim records an attempt and prevents a concurrent claim', () => {
  const { service, create } = setup();
  create();
  const first = service.claim('event-1', 'phone-1', 500);
  const second = service.claim('event-1', 'phone-1', 500);
  assert.equal(first?.status, 'IN_FLIGHT');
  assert.equal(first?.attemptCount, 1);
  assert.equal(second, undefined);
});
test('failed attempt can retry and stale lease cannot overwrite a newer claim', () => {
  const { service, create, advance } = setup();
  create();
  const first = service.claim('event-1', 'phone-1', 100);
  assert.ok(first?.leaseToken);
  assert.equal(
    service.failAttempt('event-1', 'phone-1', first.leaseToken, 'NETWORK_ERROR', 50),
    true
  );
  advance(50);
  const second = service.claim('event-1', 'phone-1', 100);
  assert.ok(second?.leaseToken);
  assert.notEqual(second?.leaseToken, first?.leaseToken);
  assert.equal(
    service.failAttempt('event-1', 'phone-1', first!.leaseToken!, 'STALE', 0),
    false
  );
  assert.equal(service.get('event-1', 'phone-1')?.status, 'IN_FLIGHT');
});
test('expired lease becomes recoverable', () => {
  const { service, create, advance } = setup();
  create();
  service.claim('event-1', 'phone-1', 100);
  advance(101);
  assert.equal(service.recoverExpiredLeases(), 1);
  assert.equal(service.get('event-1', 'phone-1')?.status, 'PENDING');
});
test('socket attempt does not confirm receipt; only intended device can acknowledge', () => {
  const { service, create } = setup();
  create();
  service.claim('event-1', 'phone-1', 100);
  assert.equal(service.get('event-1', 'phone-1')?.status, 'IN_FLIGHT');
  assert.equal(
    service.acknowledgePhoneStored('event-1', 'phone-1', 'other-phone'),
    false
  );
  assert.equal(
    service.acknowledgePhoneStored('event-1', 'phone-1', 'phone-1'),
    true
  );
  assert.equal(
    service.acknowledgePhoneStored('event-1', 'phone-1', 'phone-1'),
    true
  );
  assert.equal(service.get('event-1', 'phone-1')?.status, 'PHONE_STORED');
});
test('expired delivery is not claimed, but a valid late receipt can be recorded', () => {
  const { service, create, advance } = setup();
  create('event-1', 'phone-1', 1_050);
  advance(50);
  assert.equal(service.claim('event-1', 'phone-1', 100), undefined);
  assert.equal(service.get('event-1', 'phone-1')?.status, 'EXPIRED');
  assert.equal(
    service.acknowledgePhoneStored('event-1', 'phone-1', 'phone-1'),
    true
  );
  assert.equal(service.get('event-1', 'phone-1')?.status, 'PHONE_STORED');
});
test('exhausted attempts move delivery to dead letter', () => {
  const { service, create, advance } = setup(2);
  create();
  const first = service.claim('event-1', 'phone-1', 100)!;
  assert.equal(service.failAttempt('event-1', 'phone-1', first.leaseToken!, 'FAIL', 0), true);
  const second = service.claim('event-1', 'phone-1', 100)!;
  assert.equal(service.failAttempt('event-1', 'phone-1', second.leaseToken!, 'FAIL', 0), true);
  assert.equal(service.get('event-1', 'phone-1')?.status, 'DEAD_LETTERED');
});
