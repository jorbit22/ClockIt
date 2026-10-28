import {
  InMemoryDeliveryService,
  type DeliveryRecord
} from './delivery-service.ts';
export interface DeliveryTransport {
  send(record: DeliveryRecord): Promise<void>;
}
export type DispatchResult =
  | { outcome: 'NOT_CLAIMED' }
  | { outcome: 'SENT_AWAITING_ACK'; eventId: string; deviceId: string }
  | { outcome: 'RETRY_SCHEDULED'; eventId: string; deviceId: string }
  | { outcome: 'EXPIRED' }
  | { outcome: 'DEAD_LETTERED' };
export class DeliveryDispatcher {
  constructor(
    private readonly service: InMemoryDeliveryService,
    private readonly transport: DeliveryTransport,
    private readonly leaseMs = 15_000,
    private readonly retryDelayMs = 1_000
  ) {
    if (!Number.isFinite(leaseMs) || leaseMs <= 0) {
      throw new TypeError('leaseMs must be positive');
    }
    if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
      throw new TypeError('retryDelayMs must be non-negative');
    }
  }
  async dispatch(
    eventId: string,
    deviceId: string
  ): Promise<DispatchResult> {
    const record = this.service.claim(
      eventId,
      deviceId,
      this.leaseMs
    );
    if (!record || !record.leaseToken) {
      return { outcome: 'NOT_CLAIMED' };
    }
    try {
      await this.transport.send(record);
      // A successful send only means the transport accepted the send.
      // The delivery remains IN_FLIGHT until an authenticated phone
      // reports that the event has been durably stored.
      return {
        outcome: 'SENT_AWAITING_ACK',
        eventId,
        deviceId
      };
    } catch {
      this.service.failAttempt(
        eventId,
        deviceId,
        record.leaseToken,
        'TRANSPORT_SEND_FAILED',
        this.retryDelayMs
      );
      const latest = this.service.get(eventId, deviceId);
      if (latest?.status === 'EXPIRED') {
        return { outcome: 'EXPIRED' };
      }
      if (latest?.status === 'DEAD_LETTERED') {
        return { outcome: 'DEAD_LETTERED' };
      }
      return {
        outcome: 'RETRY_SCHEDULED',
        eventId,
        deviceId
      };
    }
  }
}
