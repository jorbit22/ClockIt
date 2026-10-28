import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryWatchEventStore,
  PhoneWatchRelay,
  SimulatedWatchTransport,
  type RelayEvent,
  type WatchAcknowledgment,
  type WatchTransport
} from '../../src/phone-watch-relay/phone-watch-relay.js';
function setup(now = 1_000) {
  let clock = now;
  const getNow = () => clock;
  const watch = new InMemoryWatchEventStore(getNow);
  const transport = new SimulatedWatchTransport(watch, getNow);
  const relay = new PhoneWatchRelay(transport, getNow, 3);
  const event: RelayEvent = {
    eventId: 'event-1',
    createdAt: now,
    expiresAt: now + 10_000,
    payload: { action: 'show-alert', message: 'Test event' }
  };
  return {
    watch,
    transport,
    relay,
    event,
    advanceTime: (milliseconds: number) => {
      clock += milliseconds;
    }
  };
}
test('successful delivery is acknowledged after watch storage', async () => {
  const { watch, relay, event } = setup();
  relay.queue(event);
  const result = await relay.deliver(event.eventId);
  assert.equal(result.status, 'ACKNOWLEDGED');
  assert.equal(result.attemptCount, 1);
  assert.equal(watch.count(), 1);
  assert.deepEqual(watch.get(event.eventId), event);
});
test('lost acknowledgment can be retried without duplicating the watch event', async () => {
  const { watch, transport, relay, event } = setup();
  relay.queue(event);
  transport.loseNextAcknowledgment = true;
  const first = await relay.deliver(event.eventId);
  assert.equal(first.status, 'PENDING');
  assert.equal(first.lastError, 'SIMULATED_ACKNOWLEDGMENT_LOST');
  assert.equal(watch.count(), 1);
  const second = await relay.deliver(event.eventId);
  assert.equal(second.status, 'ACKNOWLEDGED');
  assert.equal(second.attemptCount, 2);
  assert.equal(watch.count(), 1);
});
test('queueing the same event twice does not create another relay record', () => {
  const { relay, event } = setup();
  relay.queue(event);
  relay.queue(event);
  assert.equal(relay.list().length, 1);
});
test('reusing an event ID with different content is rejected', () => {
  const { relay, event } = setup();
  relay.queue(event);
  assert.throws(
    () => relay.queue({
      ...event,
      payload: { action: 'different-action' }
    }),
    /EVENT_ID_CONFLICT/
  );
});
test('expired event is not sent to the watch', async () => {
  const { relay, event, advanceTime, watch } = setup();
  relay.queue(event);
  advanceTime(10_000);
  const result = await relay.deliver(event.eventId);
  assert.equal(result.status, 'EXPIRED');
  assert.equal(result.attemptCount, 0);
  assert.equal(watch.count(), 0);
});
test('an acknowledgment for a different event ID is rejected', async () => {
  const { relay, event } = setup();
  const wrongAcknowledgmentTransport: WatchTransport = {
    async send(): Promise<WatchAcknowledgment> {
      return { eventId: 'some-other-event', storedAt: 1_001 };
    }
  };
  const guardedRelay = new PhoneWatchRelay(
    wrongAcknowledgmentTransport,
    () => 1_000,
    3
  );
  guardedRelay.queue(event);
  const result = await guardedRelay.deliver(event.eventId);
  assert.equal(result.status, 'PENDING');
  assert.equal(result.lastError, 'ACK_EVENT_ID_MISMATCH');
});
