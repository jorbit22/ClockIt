export interface CreateEventInput {
  id: string;
  source: string;
  type: string;
  occurredAt: string;
  data: unknown;
  subject?: string;
}
export interface ClockitEvent {
  specversion: '1.0';
  id: string;
  source: string;
  type: string;
  time: string;
  subject?: string;
  data: unknown;
}
function requireNonEmptyString(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}
export function createEvent(input: CreateEventInput): ClockitEvent {
  requireNonEmptyString('id', input.id);
  requireNonEmptyString('source', input.source);
  requireNonEmptyString('type', input.type);
  requireNonEmptyString('occurredAt', input.occurredAt);
  if (Number.isNaN(Date.parse(input.occurredAt))) {
    throw new TypeError('occurredAt must be a valid date-time string');
  }
  if (
    input.subject !== undefined &&
    (typeof input.subject !== 'string' || input.subject.trim().length === 0)
  ) {
    throw new TypeError('subject must be a non-empty string when provided');
  }
  const event: ClockitEvent = {
    specversion: '1.0',
    id: input.id,
    source: input.source,
    type: input.type,
    time: new Date(input.occurredAt).toISOString(),
    data: input.data
  };
  if (input.subject !== undefined) {
    event.subject = input.subject;
  }
  return event;
}
