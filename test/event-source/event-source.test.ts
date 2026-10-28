import test from 'node:test';
import assert from 'node:assert/strict';
test('event source creates a structured event for a valid occurrence', async () => {
  const { createEvent } = await import('../../src/event-source/event-source.ts');
  const event = createEvent({
    source: 'clockit:test',
    type: 'clockit.business-occurrence',
    subject: 'item-123',
    data: { message: 'Test occurrence' },
    occurredAt: '2026-10-28T10:00:00.000Z',
    id: 'event-001'
  });
  assert.equal(event.specversion, '1.0');
  assert.equal(event.id, 'event-001');
  assert.equal(event.source, 'clockit:test');
  assert.equal(event.type, 'clockit.business-occurrence');
  assert.equal(event.time, '2026-10-28T10:00:00.000Z');
  assert.deepEqual(event.data, { message: 'Test occurrence' });
});
test('event source rejects an empty event ID', async () => {
  const { createEvent } = await import('../../src/event-source/event-source.ts');
  assert.throws(() => createEvent({
    id: ' ',
    source: 'clockit:test',
    type: 'clockit.business-occurrence',
    occurredAt: '2026-10-28T10:00:00.000Z',
    data: {}
  }), /id must be a non-empty string/);
});
test('event source rejects an invalid occurrence time', async () => {
  const { createEvent } = await import('../../src/event-source/event-source.ts');
  assert.throws(() => createEvent({
    id: 'event-002',
    source: 'clockit:test',
    type: 'clockit.business-occurrence',
    occurredAt: 'not-a-date',
    data: {}
  }), /occurredAt must be a valid date-time string/);
});
test('separate occurrences can have distinct event IDs', async () => {
  const { createEvent } = await import('../../src/event-source/event-source.ts');
  const first = createEvent({
    id: 'event-003',
    source: 'clockit:test',
    type: 'clockit.business-occurrence',
    occurredAt: '2026-10-28T10:00:00.000Z',
    data: { item: 'item-123' }
  });
  const second = createEvent({
    id: 'event-004',
    source: 'clockit:test',
    type: 'clockit.business-occurrence',
    occurredAt: '2026-10-28T10:00:00.000Z',
    data: { item: 'item-123' }
  });
  assert.notEqual(first.id, second.id);
});
