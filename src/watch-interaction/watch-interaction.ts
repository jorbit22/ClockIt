import {
  TransactionProcessor,
  type TransactionIntent,
  type TransactionIntentInput
} from '../backend-transaction/transaction-processor.js';
export interface DoubleTapInput extends TransactionIntentInput {
  eventExpiresAt: number;
}
export type DoubleTapResult =
  | {
      accepted: true;
      intent: TransactionIntent;
    }
  | {
      accepted: false;
      reason: 'EVENT_EXPIRED';
    }
export class WatchInteractionCoordinator {
  constructor(
    private readonly processor: TransactionProcessor,
    private readonly now: () => number = Date.now
  ) {}
  async handleDoubleTap(
    input: DoubleTapInput
  ): Promise<DoubleTapResult> {
    if (!Number.isFinite(input.eventExpiresAt)) {
      throw new TypeError('eventExpiresAt must be a finite timestamp');
    }
    // An existing intent may be retrieved after event expiry.
    // This prevents a retry from losing the result of an earlier action.
    const existing = this.processor.get(input.intentId);
    if (!existing && input.eventExpiresAt <= this.now()) {
      return {
        accepted: false,
        reason: 'EVENT_EXPIRED'
      };
    }
    const {
      eventExpiresAt: _eventExpiresAt,
      ...intentInput
    } = input;
    const intent = await this.processor.submit(intentInput);
    return {
      accepted: true,
      intent
    };
  }
}
