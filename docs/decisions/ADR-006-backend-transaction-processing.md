# ADR-006: Backend Transaction-Intent Processing, Execution, and Outcome Communication

- **Status:** Proposed
- **Date:** 28 October 2026
- **Decision scope:** Backend processing of transaction intents initiated through the watch and phone relay

## 1. Context

The assessment requires a complete event-to-transaction flow, including double-tap handling, transaction execution, interruption recovery, duplicate delivery, and communication of the final outcome.

The backend must distinguish receiving a request from accepting it durably, submitting an operation for execution, confirming its outcome, recording that outcome, and communicating it to the phone or watch.

A lost response does not prove that execution failed. Repeated or concurrent requests must not create multiple logical intents, and recovery must not blindly repeat an operation whose execution status is uncertain.

The research and proposed design document the relevant principles and failure scenarios. The selected database, executor, provider contract, and deployment environment have not yet been established.

## 2. Decision

Adopt a transaction-intent coordinator as the logical owner of backend intent processing, execution coordination, durable outcome recording, and outcome-retrieval behavior.

The proposed design will follow these rules:

1. Each logical action has a stable intent identity that remains unchanged across delivery retries and recovery.
2. Durable intent creation uses an enforceable uniqueness rule and an atomic or race-safe create-or-retrieve operation.
3. Repeated requests with equivalent immutable parameters resolve to the existing intent. Reuse of the same identity with conflicting material parameters is rejected and recorded diagnostically.
4. Intent processing and external execution are separate responsibilities connected through a defined execution adapter.
5. The transaction state model distinguishes acceptance, processing, execution, uncertainty, confirmed outcome, and expiry.
6. State changes require defined evidence and concurrency-safe updates. Stale workers must not overwrite newer execution evidence.
7. Concurrent workers must coordinate execution through a defined claim or equivalent mechanism. A claim alone is not treated as a guarantee against duplicate external execution.
8. The original intent and execution identity are preserved during retries and recovery. Executor-side idempotency and authoritative status reconciliation are used where supported.
9. When execution may have occurred but the outcome cannot be established, the backend preserves an uncertain state and reconciles the existing execution rather than blindly submitting a new operation.
10. An authoritative outcome must meet the defined persistence contract before the backend claims that it is durably available.
11. Outcome communication is independent of transaction execution. Failed delivery can be retried, and the caller can retrieve the existing outcome without creating a new transaction.
12. Observability correlates the original intent across receipt, validation, durable acceptance, execution, outcome recording, and outcome communication.

## 3. Transaction state and evidence

The proposed state model includes:

- `RECEIVED`
- `ACCEPTED`
- `REJECTED`
- `PROCESSING`
- `EXECUTION_PENDING`
- `EXECUTION_IN_PROGRESS`
- `OUTCOME_UNKNOWN`
- `SUCCEEDED`
- `FAILED`
- `EXPIRED`

The proposed permitted transitions and required evidence are documented in `docs/design/backend-transaction-processing.md`.

A timeout alone does not establish failure. An intent whose execution may already have occurred must not be marked expired as a substitute for resolving uncertainty. Contradictory or delayed evidence must follow a defined reconciliation path rather than silently overwriting a terminal result.

The transition model remains subject to verification against the chosen executor and persistence contract.

## 4. Execution and duplicate protection

The backend must coordinate concurrent workers and preserve stable identities across execution attempts.

The selected execution adapter must document:

- The operation and parameters submitted.
- The stable identity passed to the executor.
- The meaning of submission acceptance.
- The evidence required for confirmed success or failure.
- How timeouts and ambiguous responses are represented.
- Whether the executor supports idempotency keys or equivalent protection.
- Whether an existing execution can be queried or reconciled.

Exactly-once external execution is not guaranteed merely by storing an idempotency key or creating one backend intent record. Any stronger guarantee depends on the executor contract, identity propagation, persistence behavior, and verified recovery mechanisms.

## 5. Outcome persistence and communication

The backend records the authoritative result under a defined durability contract and correlates it with the original intent and, where applicable, the external execution identifier.

The design distinguishes:

- Outcome recorded by the backend.
- Outcome communication attempted.
- Phone receipt and durable recording.
- Watch receipt and presentation.

Each acknowledgment must have a documented meaning. A failed communication attempt must not trigger a second transaction execution solely to regenerate the outcome.

## 6. Alternatives considered

### 6.1 Execute directly inside request handling

Not selected as the architectural default.

A request handler that combines receipt, execution, and response delivery makes it harder to recover when the process stops or the response is lost. A defined coordinator and execution boundary make these responsibilities easier to reason about and test.

A synchronous interface may still be used to acknowledge durable acceptance or return an available result.

### 6.2 Treat a timeout as transaction failure

Rejected.

The execution system may have completed the operation even though the response did not reach the backend. The backend must reconcile ambiguous execution rather than assume failure.

### 6.3 Create a new intent for every retry

Rejected.

Retries of the same logical action must preserve identity and resolve to the existing intent. A genuinely new user action requires a distinct identity under the defined business rules.

### 6.4 Rely only on an in-memory idempotency cache

Rejected as the sole duplicate-protection mechanism.

Process restarts and cache expiry can remove the evidence needed to recognize an earlier request. Durable identity and recovery requirements must be met by the selected persistence design.

### 6.5 Claim exactly-once execution from backend idempotency alone

Rejected.

Backend deduplication prevents duplicate logical intent creation but cannot independently guarantee how an external executor handles repeated submissions.

### 6.6 Add a financial ledger without an established requirement

Not selected by default.

A ledger should be included if the assessment or selected transaction model requires financial accounting records. If required, its invariants, consistency rules, and relationship to external execution must be specified and verified.

## 7. Consequences

### Positive consequences

- Request retries and duplicate delivery can resolve to an existing intent.
- Execution uncertainty is represented explicitly instead of being mistaken for failure.
- Transaction execution can be recovered independently of outcome communication.
- State transitions and latency stages can be tested and observed.
- External execution limitations remain visible rather than being hidden behind unsupported guarantees.

### Costs and limitations

- Durable intent storage and concurrency-safe updates add implementation work.
- Execution recovery depends on the selected executor's capabilities.
- Uncertain outcomes may require reconciliation rather than immediate retry.
- Outcome delivery needs its own acknowledgment and retry contract.
- No production reliability, latency, or exactly-once guarantee is established by this decision record.

## 8. Verification required

Before this decision can be accepted as verified, the implementation must provide evidence for:

1. Repeated and concurrent requests resolving to one logical intent.
2. Conflicting parameters under the same identity being handled according to contract.
3. Concurrent workers being prevented from making unsafe duplicate submissions under the supported execution guarantees, including a test where a worker resumes after its claim expires and another worker has taken over.
4. Process interruption after durable acceptance and successful recovery.
5. Execution that may have succeeded despite a lost response.
6. Recovery using the original intent and execution identity.
7. Stale workers and delayed notifications being unable to overwrite newer authoritative evidence.
8. Outcome persistence and independent outcome-delivery retries.
9. Repeated status queries returning the existing intent without initiating execution.
10. Correlated latency measurements across the relevant watch, phone, relay, and backend stages.
11. Clear separation of simulation, emulator, and physical-device results.
12. Any required ledger invariants and reconciliation behavior.

No implementation or test results are claimed by this ADR.

## 9. Open decisions

The following remain open until supported by assessment evidence, repository constraints, authoritative technical sources, or explicit and testable assumptions:

1. Actual transaction type and business rules.
2. Simulated executor, external provider integration, or both.
3. Request, response, and status-query contracts.
4. Authentication and authorization.
5. Database, transaction boundaries, and durability guarantees.
6. Atomic intent-creation and processing coordination mechanism.
7. Idempotency scope, retention, and conflicting-parameter rules.
8. Executor-side idempotency and reconciliation capabilities.
9. Recovery policy when execution cannot be authoritatively resolved.
10. Exact state-transition and terminal-state rules.
11. Outcome persistence and communication mechanism.
12. Whether a financial ledger is required.
13. Retry, timeout, expiry, and retention policies.
14. Diagnostic event schema and correlation conventions.
15. Backend framework and deployment architecture.

These are implementation-dependent decisions, not claims that the component is already implemented or verified.

## 10. References

- `docs/research/backend-transaction-processing-research.md`
- `docs/design/backend-transaction-processing.md`
- `docs/design/watch-interaction.md`
- `docs/design/phone-to-watch-relay.md`
- `docs/design/backend-event-delivery.md`
- `docs/requirements/assessment-requirements.md`
- AWS Builders' Library, _Making retries safe with idempotent APIs_: https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/
- Modern Treasury, _Idempotency_: https://www.moderntreasury.com/learn/idempotency
- Modern Treasury Ledger documentation, _Ledger guarantees_: https://docs.moderntreasury.com/ledgers/docs/ledgers-guarantees
- Modern Treasury Ledger documentation, _Linking ledger transactions to payment objects_: https://docs.moderntreasury.com/ledgers/docs/linking-ledger-transaction-to-payment-objects
