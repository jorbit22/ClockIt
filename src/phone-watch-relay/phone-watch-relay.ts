export interface RelayEvent {
  eventId: string;
  createdAt: number;
  expiresAt: number;
  payload: Record<string, unknown>;
}
export type RelayStatus =
  | 'PENDING'
  | 'IN_FLIGHT'
  | 'AWAITING_ACK'
  | 'ACKNOWLEDGED'
  | 'EXPIRED'
  | 'FAILED_TERMINAL';
export interface RelayRecord {
  event: RelayEvent;
  status: RelayStatus;
  attemptCount: number;
  updatedAt: number;
  lastError?: string;
}
export interface WatchAcknowledgment {
  eventId: string;
  storedAt: number;
}
export interface WatchTransport {
  send(event: RelayEvent): Promise<WatchAcknowledgment>;
}
function validateEvent(event: RelayEvent): void {
  if (typeof event.eventId !== 'string' || !event.eventId.trim()) {
    throw new TypeError('eventId must be a non-empty string');
  }
  if (!Number.isFinite(event.createdAt) ||
      !Number.isFinite(event.expiresAt)) {
    throw new TypeError('Event timestamps must be finite numbers');
  }
  if (event.payload === null ||
      typeof event.payload !== 'object' ||
      Array.isArray(event.payload)) {
    throw new TypeError('payload must be an object');
  }
}
function cloneEvent(event: RelayEvent): RelayEvent {
  return structuredClone(event);
}
export class InMemoryWatchEventStore {
  private readonly events = new Map<string, RelayEvent>();
  constructor(private readonly now: () => number = Date.now) {}
  receive(event: RelayEvent): 'STORED' | 'DUPLICATE' | 'EXPIRED' {
    validateEvent(event);
    if (event.expiresAt <= this.now()) {
      return 'EXPIRED';
    }
    const existing = this.events.get(event.eventId);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(event)) {
        throw new Error('EVENT_ID_CONFLICT: event ID has different content');
      }
      return 'DUPLICATE';
    }
    this.events.set(event.eventId, cloneEvent(event));
    return 'STORED';
  }
  get(eventId: string): RelayEvent | undefined {
    const event = this.events.get(eventId);
    return event ? cloneEvent(event) : undefined;
  }
  count(): number {
    return this.events.size;
  }
}
/**
 * Assessment simulator only.
 * It stores the event on the simulated watch before returning an
 * application acknowledgment. It can also simulate a lost acknowledgment.
 */
export class SimulatedWatchTransport implements WatchTransport {
  loseNextAcknowledgment = false;
  constructor(
    private readonly watch: InMemoryWatchEventStore,
    private readonly now: () => number = Date.now
  ) {}
  async send(event: RelayEvent): Promise<WatchAcknowledgment> {
    const result = this.watch.receive(event);
    if (result === 'EXPIRED') {
      throw new Error('EVENT_EXPIRED');
    }
    if (this.loseNextAcknowledgment) {
      this.loseNextAcknowledgment = false;
      throw new Error('SIMULATED_ACKNOWLEDGMENT_LOST');
    }
    return {
      eventId: event.eventId,
      storedAt: this.now()
    };
  }
}
export class PhoneWatchRelay {
  private readonly records = new Map<string, RelayRecord>();
  private readonly inFlight = new Map<string, Promise<RelayRecord>>();
  constructor(
    private readonly transport: WatchTransport,
    private readonly now: () => number = Date.now,
    private readonly maxAttempts = 5
  ) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new TypeError('maxAttempts must be a positive integer');
    }
  }
  queue(event: RelayEvent): RelayRecord {
    validateEvent(event);
    const existing = this.records.get(event.eventId);
    if (existing) {
      if (JSON.stringify(existing.event) !== JSON.stringify(event)) {
        throw new Error('EVENT_ID_CONFLICT: event ID has different content');
      }
      return structuredClone(existing);
    }
    const timestamp = this.now();
    const record: RelayRecord = {
      event: cloneEvent(event),
      status: event.expiresAt <= timestamp ? 'EXPIRED' : 'PENDING',
      attemptCount: 0,
      updatedAt: timestamp
    };
    this.records.set(event.eventId, record);
    return structuredClone(record);
  }
  get(eventId: string): RelayRecord | undefined {
    const record = this.records.get(eventId);
    return record ? structuredClone(record) : undefined;
  }
  list(): RelayRecord[] {
    return [...this.records.values()].map(record =>
      structuredClone(record)
    );
  }
  async deliver(eventId: string): Promise<RelayRecord> {
    const running = this.inFlight.get(eventId);
    if (running) return structuredClone(await running);
    const record = this.records.get(eventId);
    if (!record) throw new Error('RELAY_EVENT_NOT_FOUND');
    if (
      record.status === 'ACKNOWLEDGED' ||
      record.status === 'EXPIRED' ||
      record.status === 'FAILED_TERMINAL'
    ) {
      return structuredClone(record);
    }
    if (record.event.expiresAt <= this.now()) {
      record.status = 'EXPIRED';
      record.updatedAt = this.now();
      return structuredClone(record);
    }
    if (record.attemptCount >= this.maxAttempts) {
      record.status = 'FAILED_TERMINAL';
      record.updatedAt = this.now();
      return structuredClone(record);
    }
    record.attemptCount += 1;
    record.status = 'IN_FLIGHT';
    record.updatedAt = this.now();
    record.lastError = undefined;
    const attempt = this.performAttempt(record);
    this.inFlight.set(eventId, attempt);
    try {
      return structuredClone(await attempt);
    } finally {
      if (this.inFlight.get(eventId) === attempt) {
        this.inFlight.delete(eventId);
      }
    }
  }
  private async performAttempt(
    record: RelayRecord
  ): Promise<RelayRecord> {
    try {
      record.status = 'AWAITING_ACK';
      record.updatedAt = this.now();
      const acknowledgment = await this.transport.send(
        cloneEvent(record.event)
      );
      if (acknowledgment.eventId !== record.event.eventId) {
        throw new Error('ACK_EVENT_ID_MISMATCH');
      }
      record.status = 'ACKNOWLEDGED';
      record.updatedAt = this.now();
      record.lastError = undefined;
    } catch (error) {
      record.lastError = error instanceof Error
        ? error.message
        : 'UNKNOWN_RELAY_ERROR';
      if (record.event.expiresAt <= this.now()) {
        record.status = 'EXPIRED';
      } else if (record.attemptCount >= this.maxAttempts) {
        record.status = 'FAILED_TERMINAL';
      } else {
        record.status = 'PENDING';
      }
      record.updatedAt = this.now();
    }
    return structuredClone(record);
  }
}
