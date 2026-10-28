import type { ClockitEvent } from '../event-source/event-source.ts';
import {
  InMemoryDeliveryService,
  type DeliveryRecord
} from './delivery-service.ts';
import {
  DeliveryDispatcher,
  type DispatchResult,
  type DeliveryTransport
} from './delivery-dispatcher.ts';
export interface DeliveryTarget {
  recipientId: string;
  deviceId: string;
}
export interface EventDeliveryTransport {
  send(event: ClockitEvent, delivery: DeliveryRecord): Promise<void>;
}
export interface DeviceDispatchResult {
  deviceId: string;
  result: DispatchResult;
}
export class EventDeliveryPipeline {
  constructor(
    private readonly service: InMemoryDeliveryService,
    private readonly transport: EventDeliveryTransport,
    private readonly leaseMs = 15_000,
    private readonly retryDelayMs = 1_000
  ) {}
  async publish(
    event: ClockitEvent,
    targets: DeliveryTarget[],
    expiresAt: number
  ): Promise<DeviceDispatchResult[]> {
    if (!Number.isFinite(expiresAt)) {
      throw new TypeError('expiresAt must be a finite timestamp');
    }
    const results: DeviceDispatchResult[] = [];
    for (const target of targets) {
      this.service.createOrGet({
        eventId: event.id,
        deviceId: target.deviceId,
        recipientId: target.recipientId,
        expiresAt
      });
      const transport: DeliveryTransport = {
        send: delivery => this.transport.send(event, delivery)
      };
      const dispatcher = new DeliveryDispatcher(
        this.service,
        transport,
        this.leaseMs,
        this.retryDelayMs
      );
      results.push({
        deviceId: target.deviceId,
        result: await dispatcher.dispatch(event.id, target.deviceId)
      });
    }
    return results;
  }
}
