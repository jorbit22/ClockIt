# Backend Transaction-Intent Processing, Execution, and Outcome Communication

**Project:** Clockit — Real-Time Event-to-Transaction Streaming Infrastructure
**Component:** Backend transaction-intent processing, execution, and outcome communication
**Stage:** 6 — Backend transaction processing
**Status:** Proposed; implementation and verification pending
**Date:** 28 October 2026

## 1. Purpose

This document defines a proposed backend design for receiving a transaction intent, validating it, preventing duplicate logical actions, coordinating execution, preserving the authoritative outcome, and making that outcome available to the phone and watch.

The assessment requires an end-to-end flow from smartwatch double tap through phone relay and backend processing to outcome communication. It also requires safe behavior when requests are duplicated, connections are interrupted, processing is delayed, or a transaction completes but its outcome is not communicated.

This is a proposed design, not evidence of an existing Clockit implementation. Storage technology, execution provider, transaction type, and financial accounting requirements remain subject to confirmation.

## 2. Scope and boundaries

### 2.1 Responsibilities owned by this component

The backend transaction-processing component is responsible for:

- Receiving transaction-intent requests from the phone-side relay or its defined backend interface.
- Authenticating the caller and validating the request.
- Resolving the stable identity of the logical intent.
- Applying authoritative business rules and authorization checks.
- Preventing repeated or concurrent submissions from creating duplicate logical transactions.
- Recording processing state under an explicit durability guarantee.
- Coordinating execution through a defined execution interface.
- Preserving uncertainty when execution may have occurred but confirmation is missing.
- Resolving the existing transaction's status after interruptions.
- Recording and exposing authoritative outcomes.
- Allowing outcome retrieval or communication to be retried independently of transaction execution.
- Producing correlated diagnostics and test evidence.

### 2.2 Responsibilities outside this component

- The watch recognizes the user's double tap and initiates the logical intent.
- The phone-watch relay transports the intent between the watch and phone and applies its own acknowledgment and recovery contract.
- The adaptive connection manager manages backend connection liveness and pending communication.
- The backend transaction processor decides whether an intent may be processed and owns the authoritative transaction-processing state.
- A simulated or external execution adapter performs the operation requested by the backend.
- The outcome-delivery path transports the recorded result to the phone and watch. Delivery failure must not automatically repeat execution.

The exact API boundary between the relay and this component must be aligned with the implementation architecture.

## 3. Design principles

### 3.1 One logical action has one stable intent identity

Each logical transaction action must have a stable intent identity that survives retries and the recovery operations required by the selected storage design.

Repeated submissions of the same intent must resolve to the existing intent rather than create another one.

The system must define what happens when the same identity is submitted with different transaction parameters. It must not silently reinterpret that request as a valid update.

### 3.2 Request receipt is not transaction execution

The backend must distinguish receiving a request from accepting it, executing it, confirming its outcome, and communicating that outcome.

A network response or successful database write does not, by itself, prove that a transaction executed successfully.

### 3.3 Durable state must support recovery

Before the backend acknowledges an intent as durably accepted, it must record enough information to recover the intent according to the chosen storage guarantee.

The design must explicitly identify which records survive process interruption and which operations may need reconciliation after restart.

### 3.4 A timeout is not proof of failure

When an execution request may have reached the executor but its result is missing, the backend must represent the result as uncertain.

It must reconcile or query the existing execution where the chosen executor supports that capability. It must not blindly submit a new logical transaction because a response is late.

### 3.5 Delivery and execution have separate retry rules

The backend may retry communicating an already recorded outcome without repeating transaction execution.

Execution retries require a separate contract based on the executor's capabilities, stable identity, and authoritative status. The backend must not assume that its own idempotency record makes an external executor idempotent.

### 3.6 Claims must match available evidence

The system must not report success, failure, or finality beyond what authoritative evidence supports.

An unresolved result must remain distinguishable from confirmed failure. A transport acknowledgment must not be presented as transaction success.

## 4. Logical architecture

The proposed logical flow is:

1. The phone-side relay submits a transaction intent to the backend interface.
2. The request handler authenticates the caller, validates the request structure, and resolves the stable intent identity.
3. The intent store finds an existing intent or creates one under a defined uniqueness and durability contract.
4. The processing coordinator evaluates authoritative authorization, eligibility, and business rules.
5. The coordinator records the processing state and initiates the operation through an execution adapter.
6. The execution adapter returns evidence, a confirmed result, or an unresolved result according to its contract.
7. The coordinator records the authoritative outcome or an explicit unresolved state.
8. The outcome interface returns or publishes the recorded status.
9. The phone-side delivery path communicates the result to the watch. Failure to deliver the result does not itself repeat execution.

This is a logical decomposition. It does not require each responsibility to be a separate deployed service. Deployment boundaries will be chosen after implementation constraints and testing needs are confirmed.

## 5. Request contract

### 5.1 Required identity and request information

The request contract must define, at minimum:

- A stable intent identifier.
- The identity of the requesting user or authorized device.
- The event or business context associated with the intent, where applicable.
- The requested operation and its validated parameters.
- A creation time or equivalent freshness information where required by the business rules.
- An explicit schema or protocol version.
- Any authorization or correlation information required by the system.

The actual fields, serialization, authentication mechanism, and validation rules remain open until the repository and assessment interfaces are confirmed.

### 5.2 Identity reuse

The same stable intent identifier must be reused for retries of the same logical action.

If an existing identifier is submitted with matching parameters, the backend should return or expose the existing intent's current state rather than create another intent.

If the identifier is reused with conflicting parameters, the backend must reject the conflict or handle it under an explicitly documented rule. It must not silently overwrite the existing intent.

### 5.3 Event identity and intent identity

An event identifies the occurrence that initiated the interaction. An intent identifies a particular logical transaction action.

The design must not assume that an event can produce only one intentional action unless the business rules establish that constraint.

Duplicate prevention must distinguish a repeated request for an existing action from a genuinely new action permitted by the business rules.

## 6. Proposed transaction state model

The following states are proposed for the design. They must be reviewed against the selected execution model before implementation.

| State                   | Meaning                                                                                            | Evidence required                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `RECEIVED`              | The backend has observed the request.                                                              | Request reached the backend interface.                                     |
| `ACCEPTED`              | The intent has passed initial validation and has been durably recorded under the defined contract. | Valid request plus durable intent record.                                  |
| `REJECTED`              | The request or intent is not permitted to proceed.                                                 | Defined validation, authorization, or business-rule rejection.             |
| `PROCESSING`            | The backend is coordinating the existing intent.                                                   | Durable processing state and valid transition.                             |
| `EXECUTION_PENDING`     | The operation is ready to be submitted to the executor.                                            | Required checks passed and submission is permitted.                        |
| `EXECUTION_IN_PROGRESS` | Execution has been initiated and has not yet reached a confirmed result.                           | Evidence from the execution interface sufficient for this state.           |
| `OUTCOME_UNKNOWN`       | Available evidence cannot establish whether execution completed.                                   | An ambiguous response, timeout, or interruption after possible submission. |
| `SUCCEEDED`             | The operation's success is authoritatively confirmed.                                              | Valid success evidence under the executor contract.                        |
| `FAILED`                | The operation's failure is authoritatively confirmed.                                              | Valid failure evidence under the executor contract.                        |
| `EXPIRED`               | The intent is no longer eligible under the applicable expiry rules.                                | Authoritative expiry evaluation.                                           |

These states are not all necessarily linear. For example, a request may be rejected before execution, while an uncertain execution may later resolve to `SUCCEEDED` or `FAILED`.

The implementation must define allowed transitions, concurrent-update protection, recovery behavior, and whether some state transitions are terminal.

A timeout alone must not move `OUTCOME_UNKNOWN` to `FAILED`. A late response must be evaluated against the current intent and execution identity before changing the state.

The state `RECEIVED` may be transient if the implementation does not durably store every received request. The API must not imply durable acceptance until the acceptance contract has been satisfied.

### 6.1 Proposed permitted state transitions

The following transitions are proposed. The implementation must enforce them through atomic state updates and must reject stale updates that conflict with newer execution evidence.

| Current state           | Permitted next state    | Condition                                                                       |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `RECEIVED`              | `ACCEPTED`              | Validation and durable acceptance succeed.                                      |
| `RECEIVED`              | `REJECTED`              | Validation or authorization rejects the request.                                |
| `ACCEPTED`              | `PROCESSING`            | A worker begins coordinating the existing intent.                               |
| `ACCEPTED`              | `EXPIRED`               | The intent expires before execution becomes eligible.                           |
| `PROCESSING`            | `EXECUTION_PENDING`     | Required checks pass and execution is permitted.                                |
| `PROCESSING`            | `REJECTED`              | A required business or authorization check rejects the intent before execution. |
| `PROCESSING`            | `EXPIRED`               | Expiry rules prohibit execution and no submission may have occurred.            |
| `EXECUTION_PENDING`     | `EXECUTION_IN_PROGRESS` | Submission begins under the execution adapter contract.                         |
| `EXECUTION_PENDING`     | `EXPIRED`               | Expiry rules prohibit submission and no submission has occurred.                |
| `EXECUTION_IN_PROGRESS` | `SUCCEEDED`             | Authoritative success evidence is obtained.                                     |
| `EXECUTION_IN_PROGRESS` | `FAILED`                | Authoritative evidence establishes failure under the executor contract.         |
| `EXECUTION_IN_PROGRESS` | `OUTCOME_UNKNOWN`       | Execution may have occurred but its outcome cannot be established.              |
| `OUTCOME_UNKNOWN`       | `SUCCEEDED`             | Reconciliation obtains authoritative success evidence.                          |
| `OUTCOME_UNKNOWN`       | `FAILED`                | Reconciliation obtains authoritative failure evidence.                          |

These transitions are not permission to move state based only on a timeout or a worker's local belief. Each transition must be supported by the evidence defined in section 6 and the execution adapter contract.

If recovery establishes that submission definitely did not occur, the implementation may return the intent to `EXECUTION_PENDING` only through an explicitly defined, concurrency-safe recovery transition. It must not do so merely because a response was lost.

`SUCCEEDED` and `FAILED` are terminal for ordinary processing. Any later contradictory evidence must trigger a defined reconciliation or exception-handling path rather than silently rewriting the recorded result.

`EXPIRED` means execution was no longer eligible before submission. An intent whose execution may already have occurred must not be marked `EXPIRED` as a substitute for resolving `OUTCOME_UNKNOWN`.

The implementation must record the transition evidence and prevent stale workers from overwriting a newer state. These proposed transitions require verification against the selected executor and persistence model.

## 7. Durable intent creation and duplicate prevention

### 7.1 Required behavior

The backend must ensure that repeated or concurrent requests for the same logical intent cannot create multiple logical transaction records.

The chosen storage design must provide an enforceable uniqueness rule for the stable intent identity and an atomic or otherwise race-safe create-or-retrieve operation.

A separate “check whether it exists” operation followed by an unrelated “insert” operation is insufficient if concurrent requests can both pass the check and insert separate records.

### 7.2 Conflicting request parameters

The backend must compare a repeated request with the existing intent under a documented rule.

A request with the same identity and equivalent immutable parameters may resolve to the existing intent.

A request with the same identity but different material parameters must not silently alter the transaction being processed. The system should reject the conflict and record diagnostic evidence.

### 7.3 Retention and recovery

The required retention period for intent identities and deduplication records must be selected according to the assessment and execution model.

The design must not assume that a short-lived API idempotency cache alone protects against duplicate execution for the entire lifetime of a transaction.

The durable intent record must be sufficient to recover the existing action and retrieve its latest known state.

## 8. Execution boundary

### 8.1 Execution adapter

The transaction coordinator must call execution through a defined interface rather than embedding executor-specific behavior throughout request handling.

The adapter contract must define:

- The stable identity passed to the executor.
- The operation and parameters submitted.
- What constitutes successful submission.
- How confirmed success and failure are represented.
- How timeouts and ambiguous responses are represented.
- Whether the executor supports idempotency keys or equivalent duplicate protection.
- Whether an existing execution can be queried or reconciled.
- How external execution identifiers are recorded and correlated.

The concrete interface and fields remain open until the actual executor is known.

### 8.2 Simulated execution

If the assessment environment uses a simulated executor, it must preserve the same meaningful failure distinctions as the intended architecture.

The simulation should support deterministic cases where:

- Execution succeeds and the response arrives.
- Execution fails with authoritative evidence.
- Execution may have succeeded but the response is lost.
- The backend restarts during processing.
- A repeated request arrives.
- The outcome is available but its communication fails.

A simulation can verify the application's control flow. It cannot prove that an external provider or real financial system offers the same guarantees.

### 8.3 External execution

If an external provider is used, the backend must map the provider's actual status and identifiers into its internal state model.

The design must not infer that a timeout means the provider did nothing. Where supported, it should query the existing provider operation or consume authoritative status updates.

If the provider does not support safe retries or reliable status resolution, that limitation must be documented, and the recovery policy must prevent an unverified new submission from silently replacing the uncertain operation.

### 8.4 Concurrent processing and execution claims

The backend must coordinate concurrent workers so that only an eligible worker can advance an intent into execution submission.

The implementation must use a defined concurrency-control mechanism, such as an atomic state transition with a claim token or a lease, to prevent ordinary concurrent processing from independently submitting the same intent.

A claim must be associated with the stable intent identity and, where applicable, an execution-attempt identity. State updates must verify that the worker still has authority to make the update.

A lease or claim alone does not guarantee that an external operation executes only once. A worker may pause, lose its lease, and later resume after another worker has taken over.

Therefore:

- The execution adapter must preserve the original logical intent identity across retries.
- Where supported, the executor must receive a stable idempotency key that prevents repeated submissions from creating separate operations.
- Where executor-side idempotency is unavailable, recovery must use authoritative execution-status queries or reconciliation when available.
- If the backend cannot establish whether an earlier submission took effect, it must preserve the uncertain outcome rather than assume that a new submission is safe.
- The selected implementation must document the guarantees it can actually provide and the remaining limitations.

**Planned verification:** Run concurrent workers against the same intent, interrupt a worker during submission, and simulate a worker resuming after its claim expires. Verify that the backend preserves one logical intent, rejects stale state updates, and does not claim protection against duplicate external execution unless the executor contract and test evidence support that claim.

## 9. Handling uncertain execution

### 9.1 Entry into uncertainty

The backend should enter `OUTCOME_UNKNOWN` when execution may have occurred but available evidence does not establish its result.

Examples include:

- The execution request was sent but its response timed out.
- The connection failed after submission.
- The backend process stopped before persisting the response.
- A response was received by an intermediary but not durably recorded.

The exact conditions depend on the execution adapter and persistence design.

### 9.2 Recovery

Recovery must operate on the original intent and execution identity.

The backend should:

1. Retrieve the existing intent and its last durably recorded state.
2. Determine whether submission definitely did not occur, may have occurred, or is authoritatively confirmed.
3. Query or reconcile the existing execution where supported.
4. Record new evidence and update the state only through a permitted transition.
5. Preserve `OUTCOME_UNKNOWN` while evidence remains insufficient.
6. Expose the current state so the caller can recover without creating a replacement intent.

The backend must not repeat a potentially non-idempotent execution merely because it has restarted or failed to receive a response.

### 9.3 Limits of the guarantee

Exactly-once execution cannot be claimed merely because the backend stores an idempotency key.

The effective guarantee depends on the atomicity of the backend's own records, the executor's idempotency behavior, the identity passed across the boundary, and the availability of authoritative execution status.

These properties must be verified for the selected implementation. Where they cannot be guaranteed, the design must state the limitation explicitly.

## 10. Outcome persistence and communication

### 10.1 Outcome persistence

The backend must preserve the authoritative outcome under a defined durability contract before claiming that the outcome is durably available.

If execution succeeds but the backend cannot record the result, the system must have a documented recovery strategy for resolving the discrepancy. It must not assume that repeating execution will repair a missing outcome record.

If the system uses an external provider, the provider's operation identifier and the backend's intent identifier should be correlated under the chosen contract.

### 10.2 Outcome retrieval

The backend must provide a defined way for the caller to retrieve the existing intent's current state.

The interface may use a request-response query, an asynchronous event, or both. The specific mechanism remains open.

Repeated status queries must not initiate a new transaction.

### 10.3 Outcome delivery

The system must distinguish:

- The backend has recorded an outcome.
- The backend attempted to communicate the outcome.
- The phone received and recorded the outcome.
- The watch received and presented the outcome.

Each acknowledgment must have a documented meaning.

If communication fails after the outcome is recorded, the system should retry outcome delivery or allow the caller to retrieve the existing outcome. It must not repeat transaction execution solely to regenerate the response.

## 11. Optional financial ledger boundary

The assessment must establish whether a financial ledger is required or whether a simulated transaction record is sufficient.

If a ledger is required, its design must separately define:

- Accounts and ownership.
- Debit and credit semantics.
- Balanced-entry invariants.
- Atomic posting rules.
- Pending versus posted states.
- Immutability and correction mechanisms for posted entries.
- Idempotency of posting operations.
- Reconciliation between internal records and any external execution provider.

A transaction status record is not a substitute for a ledger when financial accounting invariants are required.

If the assessment does not require a ledger, the implementation must not claim ledger guarantees it does not provide.

## 12. Observability and latency measurement

The assessment reports that some double-tap intents take more than eight seconds to reach the backend. The cause has not been reproduced or confirmed.

The implementation should emit correlated observations for the following stages where applicable:

| Observation                              | What it establishes                                                |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `backend_request_received`               | The backend interface observed the request.                        |
| `intent_validation_completed`            | Initial request validation completed.                              |
| `intent_durably_accepted`                | The intent met the defined durable-acceptance contract.            |
| `execution_submission_started`           | The backend began submitting the operation.                        |
| `execution_submission_response_received` | A submission response was observed.                                |
| `execution_outcome_confirmed`            | Authoritative outcome evidence was obtained.                       |
| `outcome_durably_recorded`               | The outcome met the persistence contract.                          |
| `outcome_delivery_attempted`             | Communication of the recorded outcome was attempted.               |
| `outcome_delivery_acknowledged`          | The recipient acknowledged the defined outcome-delivery milestone. |

These names are proposed diagnostic events, not an existing telemetry contract.

Each observation must include enough stable identity to correlate it with the original intent and distinguish retries from new actions. Retry attempt identifiers may supplement, but must not replace, the stable logical intent identity.

Local elapsed durations should use monotonic clocks. Cross-system wall-clock comparisons must account for clock offset and uncertainty. Missing timestamps must remain visible as diagnostic gaps.

The measurements must allow the team to distinguish delay before backend receipt from backend validation, queueing, execution, outcome persistence, and outcome communication.

No baseline, confirmed bottleneck, or performance improvement is claimed.

## 13. Failure and recovery scenarios

### 13.1 Same intent submitted twice

**Expected behavior:** Both requests resolve to the same logical intent. Only the existing action is processed.

**Verification:** Submit the same identity repeatedly and concurrently; confirm there is one logical intent and no unintended duplicate execution.

### 13.2 Same identity with conflicting parameters

**Expected behavior:** The backend rejects the conflicting request or applies an explicitly approved rule. It does not silently replace the existing transaction parameters.

**Verification:** Submit the same identity with materially different parameters and confirm the result and diagnostics match the defined contract.

### 13.3 Backend process stops after acceptance

**Expected behavior:** On restart, the backend recovers the durable intent and its last known state.

**Verification:** Interrupt the process after acceptance, restart it, and confirm the original intent remains retrievable and is not duplicated.

### 13.4 Execution request times out

**Expected behavior:** If execution may have occurred, the backend records an uncertain state and reconciles the existing execution.

**Verification:** Simulate an executor that performs the operation but drops its response. Confirm recovery does not submit a new logical transaction.

### 13.5 Execution succeeds but outcome delivery fails

**Expected behavior:** The authoritative result remains retrievable. Retrying communication does not repeat execution.

**Verification:** Record success, interrupt outcome communication, recover the caller, and confirm the same result is returned without another execution.

### 13.6 Duplicate or stale execution notification

**Expected behavior:** Repeated notifications are deduplicated, and stale information cannot produce an invalid state transition.

**Verification:** Deliver duplicate and out-of-order notifications and confirm the stored state follows the documented transition rules.

### 13.7 Financial record inconsistency

**Expected behavior:** If ledger behavior is required, discrepancies between execution evidence and accounting records are detected and handled through explicit recovery or reconciliation rules.

**Verification:** Inject failures at the boundaries between execution and accounting updates, then verify the required invariants and recovery evidence.

## 14. Planned verification

The test plan must cover:

- Request validation and authorization.
- Stable identity and idempotent repeated requests.
- Concurrent duplicate submissions.
- Conflicting parameters under the same identity.
- Durable acceptance and restart recovery.
- Execution success, confirmed failure, and uncertain outcome.
- Recovery after execution may have occurred.
- Outcome persistence and independent outcome-delivery retries.
- Duplicate and delayed execution notifications, if supported.
- State-transition invariants.
- Correlated latency traces across the watch, phone, relay, and backend.
- Any required ledger invariants.
- End-to-end execution and outcome communication under interruption and recovery.

Tests must record conditions, expected behavior, observed results, and limitations. Simulation, emulator, and physical-device results must be identified separately.

No implementation or verification results are claimed by this design.

## 15. Requirement traceability

| Requirement ID | Proposed design coverage                                                       | Required verification evidence                          |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `REQ-ARCH-001` | Backend transaction-processing role in the integrated architecture             | Reviewed architecture diagram and component boundaries  |
| `REQ-ARCH-002` | Backend acceptance, processing handoff, and acknowledgment semantics           | Request and acknowledgment tests                        |
| `REQ-ARCH-004` | Intent processing, execution, interruption recovery, and outcome communication | End-to-end transaction-flow tests                       |
| `REQ-DIAG-003` | Correlated timing observations for backend processing and execution            | Reproducible latency trace and measured stage durations |
| `REQ-DIAG-005` | Failure evidence, state transitions, and recovery diagnostics                  | Diagnostic scenario results and before/after evidence   |
| `REQ-TEST-001` | Recovery interfaces and interaction with connection failures                   | Connection and recovery tests                           |
| `REQ-TEST-002` | Durable intent recovery after process interruption                             | Process-interruption test results                       |
| `REQ-TEST-003` | Idempotency, duplicate delivery, uncertain execution, and outcome recovery     | End-to-end transaction-intent test results              |
| `REQ-TEST-004` | Reproduction of applicable diagnostic scenarios                                | Reproducible scenario results                           |
| `REQ-TEST-006` | Reproducible transaction-processing demonstration                              | Demonstration and environment record                    |
| `REQ-TEST-007` | Separation of simulation, emulator, and physical-device evidence               | Test environment and result records                     |
| `REQ-TRACE`    | Mapping from requirements through design to implementation and verification    | Updated assessment traceability document                |

These mappings identify intended coverage. They do not establish that the requirements have been implemented or verified.

The integrated architecture and assessment traceability document must be updated as the component design is incorporated into the overall system.

## 16. Open decisions

The following decisions remain unresolved:

1. Actual transaction type and required business rules.
2. Whether the assessment requires a simulated executor, a real provider integration, or both.
3. Exact request, response, and status-query contracts.
4. Authentication and authorization mechanism.
5. Database and durability guarantees.
6. Atomicity and concurrency-control mechanism for intent creation and processing.
7. Idempotency identity, scope, retention, and conflicting-parameter behavior.
8. Execution adapter contract and executor-side idempotency capabilities.
9. Recovery and reconciliation mechanism for uncertain execution.
10. Allowed state transitions and terminal-state rules.
11. Outcome persistence and delivery mechanism.
12. Whether a financial ledger is required and, if so, its accounting invariants.
13. Retry, timeout, expiry, and retention policies.
14. Diagnostic event schema and correlation conventions.
15. Actual backend framework and deployment architecture.

Each decision must be resolved using assessment evidence, repository constraints, authoritative technical sources, or an explicitly documented and testable assumption.

## 17. References

- `docs/research/backend-transaction-processing-research.md`
- `docs/research/backend-event-delivery-research.md`
- `docs/design/backend-event-delivery.md`
- `docs/decisions/ADR-002-backend-event-delivery.md`
- `docs/design/phone-to-watch-relay.md`
- `docs/decisions/ADR-004-phone-to-watch-relay.md`
- `docs/design/watch-interaction.md`
- `docs/decisions/ADR-005-watch-interaction.md`
- `docs/requirements/assessment-requirements.md`
- `docs/requirements/assessment-traceability.md`

## 18. Conclusion

The proposed backend design centers on a stable transaction-intent identity, durable state, duplicate-safe request handling, an explicit execution boundary, recovery from uncertain outcomes, and independent outcome communication.

Its guarantees depend on the actual storage and execution interfaces. The design does not claim exactly-once external execution, a financial ledger, production-provider behavior, or measured latency improvement without evidence.

Implementation should begin only after the unresolved decisions required for the chosen demonstration scope have been resolved or explicitly recorded as limitations.
