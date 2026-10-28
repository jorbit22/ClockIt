export type DeliveryStatus =
  | 'PENDING'
  | 'IN_FLIGHT'
  | 'PHONE_STORED'
  | 'EXPIRED'
  | 'DEAD_LETTERED';
export interface DeliveryRecord {
  eventId: string;
  deviceId: string;
  recipientId: string;
  status: DeliveryStatus;
  attemptCount: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  nextAttemptAt: number;
  leaseExpiresAt?: number;
  leaseToken?: string;
  phoneStoredAt?: number;
  lastErrorCode?: string;
  lastAttemptAt?: number;
}
export interface DeliveryServiceOptions {
  now?: () => number;
  maxAttempts?: number;
}
export class InMemoryDeliveryService {
  private readonly records = new Map<string, DeliveryRecord>();
  private readonly now: () => number;
  private readonly maxAttempts: number;
  private leaseSequence = 0;
  constructor(options: DeliveryServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.maxAttempts = options.maxAttempts ?? 5;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new TypeError('maxAttempts must be a positive integer');
    }
  }
  private key(eventId: string, deviceId: string): string {
    return JSON.stringify([eventId, deviceId]);
  }
  createOrGet(input: {
    eventId: string;
    deviceId: string;
    recipientId: string;
    expiresAt: number;
  }): DeliveryRecord {
    for (const [name, value] of Object.entries({
      eventId: input.eventId,
      deviceId: input.deviceId,
      recipientId: input.recipientId
    })) {
      if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${name} must be a non-empty string`);
      }
    }
    if (!Number.isFinite(input.expiresAt)) {
      throw new TypeError('expiresAt must be a finite timestamp');
    }
    const key = this.key(input.eventId, input.deviceId);
    const existing = this.records.get(key);
    if (existing) return { ...existing };
    const now = this.now();
    const record: DeliveryRecord = {
      eventId: input.eventId,
      deviceId: input.deviceId,
      recipientId: input.recipientId,
      status: input.expiresAt <= now ? 'EXPIRED' : 'PENDING',
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt,
      nextAttemptAt: now
    };
    this.records.set(key, record);
    return { ...record };
  }
  get(eventId: string, deviceId: string): DeliveryRecord | undefined {
    const record = this.records.get(this.key(eventId, deviceId));
    return record ? { ...record } : undefined;
  }
  list(): DeliveryRecord[] {
    return [...this.records.values()].map(record => ({ ...record }));
  }
  claim(
    eventId: string,
    deviceId: string,
    leaseMs: number
  ): DeliveryRecord | undefined {
    if (!Number.isFinite(leaseMs) || leaseMs <= 0) {
      throw new TypeError('leaseMs must be positive');
    }
    const record = this.records.get(this.key(eventId, deviceId));
    if (!record) return undefined;
    const now = this.now();
    if (record.status === 'PHONE_STORED' ||
        record.status === 'EXPIRED' ||
        record.status === 'DEAD_LETTERED') {
      return undefined;
    }
    if (record.expiresAt <= now) {
      record.status = 'EXPIRED';
      record.leaseToken = undefined;
      record.leaseExpiresAt = undefined;
      record.updatedAt = now;
      return undefined;
    }
    if (record.status === 'IN_FLIGHT' &&
        record.leaseExpiresAt !== undefined &&
        record.leaseExpiresAt > now) {
      return undefined;
    }
    if (record.nextAttemptAt > now) return undefined;
    record.status = 'IN_FLIGHT';
    record.attemptCount += 1;
    record.lastAttemptAt = now;
    record.leaseToken = `lease-${++this.leaseSequence}`;
    record.leaseExpiresAt = now + leaseMs;
    record.updatedAt = now;
    return { ...record };
  }
  failAttempt(
    eventId: string,
    deviceId: string,
    leaseToken: string,
    errorCode: string,
    retryDelayMs: number
  ): boolean {
    if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
      throw new TypeError('retryDelayMs must be non-negative');
    }
    if (!errorCode.trim()) {
      throw new TypeError('errorCode must be non-empty');
    }
    const record = this.records.get(this.key(eventId, deviceId));
    if (!record ||
        record.status !== 'IN_FLIGHT' ||
        record.leaseToken !== leaseToken) {
      return false;
    }
    const now = this.now();
    record.lastErrorCode = errorCode;
    record.leaseToken = undefined;
    record.leaseExpiresAt = undefined;
    record.updatedAt = now;
    if (record.expiresAt <= now) {
      record.status = 'EXPIRED';
    } else if (record.attemptCount >= this.maxAttempts) {
      record.status = 'DEAD_LETTERED';
    } else {
      record.status = 'PENDING';
      record.nextAttemptAt = Math.min(
        now + retryDelayMs,
        record.expiresAt
      );
    }
    return true;
  }
  recoverExpiredLeases(): number {
    const now = this.now();
    let recovered = 0;
    for (const record of this.records.values()) {
      if (record.status !== 'IN_FLIGHT' ||
          record.leaseExpiresAt === undefined ||
          record.leaseExpiresAt > now) {
        continue;
      }
      record.leaseToken = undefined;
      record.leaseExpiresAt = undefined;
      record.updatedAt = now;
      if (record.expiresAt <= now) {
        record.status = 'EXPIRED';
      } else if (record.attemptCount >= this.maxAttempts) {
        record.status = 'DEAD_LETTERED';
      } else {
        record.status = 'PENDING';
        record.nextAttemptAt = now;
      }
      recovered += 1;
    }
    return recovered;
  }
  acknowledgePhoneStored(
    eventId: string,
    intendedDeviceId: string,
    authenticatedDeviceId: string
  ): boolean {
    if (authenticatedDeviceId !== intendedDeviceId) return false;
    const record = this.records.get(
      this.key(eventId, intendedDeviceId)
    );
    if (!record) return false;
    if (record.status === 'PHONE_STORED') return true;
    const now = this.now();
    record.status = 'PHONE_STORED';
    record.phoneStoredAt = now;
    record.updatedAt = now;
    record.leaseToken = undefined;
    record.leaseExpiresAt = undefined;
    record.lastErrorCode = undefined;
    return true;
  }
}
