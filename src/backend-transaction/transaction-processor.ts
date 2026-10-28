export type TransactionStatus =
  | 'ACCEPTED'
  | 'PROCESSING'
  | 'EXECUTION_PENDING'
  | 'EXECUTION_IN_PROGRESS'
  | 'OUTCOME_UNKNOWN'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REJECTED';
export interface TransactionIntentInput {
  intentId: string;
  userId: string;
  eventId: string;
  operation: string;
  parameters: Record<string, unknown>;
}
export interface TransactionIntent extends TransactionIntentInput {
  status: TransactionStatus;
  createdAt: number;
  updatedAt: number;
  executionId?: string;
  outcome?: string;
  rejectionReason?: string;
}
export type ExecutionResult =
  | { status: 'SUCCEEDED'; executionId: string; outcome: string }
  | { status: 'FAILED'; executionId: string; outcome: string };
export interface TransactionExecutor {
  execute(intent: TransactionIntent): Promise<ExecutionResult>;
  lookup(intentId: string): Promise<ExecutionResult | undefined>;
}
function requiredString(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}
function cloneIntent(intent: TransactionIntent): TransactionIntent {
  return structuredClone(intent);
}
function requestFingerprint(input: TransactionIntentInput): string {
  return JSON.stringify({
    userId: input.userId,
    eventId: input.eventId,
    operation: input.operation,
    parameters: input.parameters
  });
}
export class TransactionProcessor {
  private readonly intents = new Map<string, TransactionIntent>();
  private readonly fingerprints = new Map<string, string>();
  private readonly inFlight = new Map<string, Promise<TransactionIntent>>();
  constructor(
    private readonly executor: TransactionExecutor,
    private readonly now: () => number = Date.now
  ) {}
  submit(input: TransactionIntentInput): Promise<TransactionIntent> {
    requiredString('intentId', input.intentId);
    requiredString('userId', input.userId);
    requiredString('eventId', input.eventId);
    requiredString('operation', input.operation);
    if (
      input.parameters === null ||
      typeof input.parameters !== 'object' ||
      Array.isArray(input.parameters)
    ) {
      throw new TypeError('parameters must be an object');
    }
    const fingerprint = requestFingerprint(input);
    const existing = this.intents.get(input.intentId);
    if (existing) {
      if (this.fingerprints.get(input.intentId) !== fingerprint) {
        throw new Error('INTENT_ID_CONFLICT: this intent ID has different parameters');
      }
      return this.inFlight.get(input.intentId) ??
        Promise.resolve(cloneIntent(existing));
    }
    const timestamp = this.now();
    const intent: TransactionIntent = {
      ...structuredClone(input),
      status: 'ACCEPTED',
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.intents.set(input.intentId, intent);
    this.fingerprints.set(input.intentId, fingerprint);
    const processing = this.processNewIntent(intent);
    this.inFlight.set(input.intentId, processing);
    void processing.finally(() => {
      if (this.inFlight.get(input.intentId) === processing) {
        this.inFlight.delete(input.intentId);
      }
    }).catch(() => {
      // The processing promise remains observable to its caller.
    });
    return processing;
  }
  get(intentId: string): TransactionIntent | undefined {
    const intent = this.intents.get(intentId);
    return intent ? cloneIntent(intent) : undefined;
  }
  async reconcile(intentId: string): Promise<TransactionIntent> {
    const intent = this.intents.get(intentId);
    if (!intent) throw new Error('INTENT_NOT_FOUND');
    const running = this.inFlight.get(intentId);
    if (running) return cloneIntent(await running);
    if (intent.status !== 'OUTCOME_UNKNOWN') {
      return cloneIntent(intent);
    }
    const result = await this.executor.lookup(intentId);
    if (!result) {
      // No evidence is not proof that execution did not happen.
      return cloneIntent(intent);
    }
    this.applyConfirmedResult(intent, result);
    return cloneIntent(intent);
  }
  async communicateOutcome(
    intentId: string,
    deliver: (intent: TransactionIntent) => Promise<void>
  ): Promise<boolean> {
    const intent = this.intents.get(intentId);
    if (!intent) throw new Error('INTENT_NOT_FOUND');
    if (intent.status !== 'SUCCEEDED' && intent.status !== 'FAILED') {
      return false;
    }
    // Delivery retries read the saved result; they never execute again.
    await deliver(cloneIntent(intent));
    return true;
  }
  private async processNewIntent(
    intent: TransactionIntent
  ): Promise<TransactionIntent> {
    this.updateStatus(intent, 'PROCESSING');
    this.updateStatus(intent, 'EXECUTION_PENDING');
    this.updateStatus(intent, 'EXECUTION_IN_PROGRESS');
    try {
      const result = await this.executor.execute(cloneIntent(intent));
      this.applyConfirmedResult(intent, result);
    } catch {
      // A thrown error may mean execution happened and only its response was lost.
      this.updateStatus(intent, 'OUTCOME_UNKNOWN');
    }
    return cloneIntent(intent);
  }
  private applyConfirmedResult(
    intent: TransactionIntent,
    result: ExecutionResult
  ): void {
    intent.executionId = result.executionId;
    intent.outcome = result.outcome;
    this.updateStatus(intent, result.status);
  }
  private updateStatus(
    intent: TransactionIntent,
    status: TransactionStatus
  ): void {
    const allowed: Record<TransactionStatus, TransactionStatus[]> = {
      ACCEPTED: ['PROCESSING'],
      PROCESSING: ['EXECUTION_PENDING', 'REJECTED'],
      EXECUTION_PENDING: ['EXECUTION_IN_PROGRESS'],
      EXECUTION_IN_PROGRESS: ['SUCCEEDED', 'FAILED', 'OUTCOME_UNKNOWN'],
      OUTCOME_UNKNOWN: ['SUCCEEDED', 'FAILED'],
      SUCCEEDED: [],
      FAILED: [],
      REJECTED: []
    };
    if (!allowed[intent.status].includes(status)) {
      throw new Error(`INVALID_TRANSITION: ${intent.status} -> ${status}`);
    }
    intent.status = status;
    intent.updatedAt = this.now();
  }
}
/**
 * Deterministic assessment simulator.
 * It stores an execution by intent ID before optionally losing the response.
 */
export class SimulatedTransactionExecutor implements TransactionExecutor {
  private readonly executions = new Map<string, ExecutionResult>();
  private nextMode: 'success' | 'failure' | 'response-lost' = 'success';
  executeCalls = 0;
  setNextMode(mode: 'success' | 'failure' | 'response-lost'): void {
    this.nextMode = mode;
  }
  async execute(intent: TransactionIntent): Promise<ExecutionResult> {
    this.executeCalls += 1;
    const existing = this.executions.get(intent.intentId);
    if (existing) return structuredClone(existing);
    const mode = this.nextMode;
    this.nextMode = 'success';
    const result: ExecutionResult = mode === 'failure'
      ? {
          status: 'FAILED',
          executionId: `execution-${intent.intentId}`,
          outcome: 'SIMULATED_FAILURE'
        }
      : {
          status: 'SUCCEEDED',
          executionId: `execution-${intent.intentId}`,
          outcome: 'SIMULATED_SUCCESS'
        };
    this.executions.set(intent.intentId, result);
    if (mode === 'response-lost') {
      throw new Error('SIMULATED_RESPONSE_LOST_AFTER_EXECUTION');
    }
    return structuredClone(result);
  }
  async lookup(intentId: string): Promise<ExecutionResult | undefined> {
    const result = this.executions.get(intentId);
    return result ? structuredClone(result) : undefined;
  }
}
