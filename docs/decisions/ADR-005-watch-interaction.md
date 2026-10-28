# ADR-005: Watch Interaction and Transaction-Intent Initiation

**Project:** Clockit — Real-Time Event-to-Transaction Streaming Infrastructure
**Decision ID:** ADR-005
**Status:** Proposed
**Date:** 28 October 2026
**Component:** Stage 5 — Watch interaction and transaction-intent initiation

## 1. Context

The Clockit assessment requires a smartwatch interaction that captures a user's double tap, initiates a transaction intent, carries that intent through the phone relay to backend processing, and communicates the resulting outcome.

The interaction must remain safe when the phone-watch connection is interrupted, the application process stops, an acknowledgment is delayed, a request is delivered more than once, or a transaction may have completed without its outcome reaching the watch.

The assessment also reports that some double-tap intents take more than eight seconds to reach the backend. The cause has not yet been reproduced or confirmed. The design must therefore support correlated timing measurements across the watch, phone, relay, and backend rather than assume the delay originates in gesture recognition.

The Stage 5 research and design documents establish the proposed interaction boundary. The watch interaction component recognizes and coordinates the user's action; the phone-watch relay transports the intent; and the backend transaction-processing component remains responsible for authoritative validation, execution, idempotency, and outcome resolution.

## 2. Decision drivers

The proposed decisions are guided by these requirements:

- Recognize the required smartwatch double-tap interaction using a supported input mechanism.
- Avoid creating multiple logical intents because of repeated input, lost responses, retries, or application interruption.
- Preserve a stable identity for the same logical transaction action.
- Distinguish local intent creation, phone receipt, backend processing, transaction execution, and outcome communication.
- Never report success without authoritative outcome evidence.
- Recover existing interactions instead of creating replacement intents when the previous result is uncertain.
- Collect enough correlated timing information to investigate the reported delay exceeding eight seconds.
- Keep transport and transaction-execution responsibilities outside the watch interaction component.
- Make proposed behavior testable without claiming that the target watch, physical BLE transport, or end-to-end path has already been verified.

## 3. Decisions

### 3.1 Decision: Separate interaction coordination from transport and transaction execution

**Proposed decision:** The watch interaction component will coordinate gesture recognition, local eligibility checks, logical intent initiation, user feedback, and interaction diagnostics.

It will not implement BLE transport, relay retries, backend authorization, transaction execution, or financial ledger updates.

The Stage 4 phone-to-watch relay remains responsible for transporting transaction intents and applying its agreed delivery and acknowledgment contract. The backend transaction-processing component remains responsible for authoritative validation, idempotency enforcement, execution, and outcome resolution.

**Reason:** Combining these responsibilities would make it difficult to determine whether a failure occurred during gesture recognition, intent creation, delivery, or transaction processing. Separate responsibilities allow each stage to be tested and diagnosed independently.

**Consequence:** The interaction component depends on explicit interfaces and status evidence from the intent, relay, and transaction components. Their actual TypeScript contracts must be established during implementation.

### 3.2 Decision: Require an explicit intent-creation durability guarantee

**Proposed decision:** The interaction component will treat an intent as `INTENT_CREATED` only when the intent component confirms creation under an explicitly documented storage guarantee.

The preferred contract is that the intent and its stable identity are durably recorded before the system reports durable creation or attempts delivery.

If the selected storage mechanism cannot provide that guarantee, the implementation must document the weaker guarantee and its effect on recovery after process interruption.

**Reason:** A successful function call or an in-memory record does not, by itself, establish that the intent can be recovered after an application process stops.

**Consequence:** The intent component's storage mechanism and durability boundary must be selected and verified. This ADR does not select a specific database or watch-storage technology.

### 3.3 Decision: Use a stable logical interaction identity and create-or-retrieve behavior

**Proposed decision:** Before requesting intent creation, the interaction must have a stable identity for the logical action. The intent component must support an atomic create-or-retrieve operation, or an equivalent mechanism, so repeating the same logical request after a timeout returns the existing intent rather than silently creating another one.

The identity and deduplication rule must survive application interruption to the extent required by the selected storage design.

If the result of an earlier creation request is unknown, the interaction component must retrieve or reconcile the existing intent before attempting creation again.

**Reason:** The first creation request may succeed while its response is lost. Retrying with a new identity could create a second logical transaction action.

**Consequence:** Identity generation, persistence, deduplication scope, and the atomicity of create-or-retrieve must be defined by the intent component's contract and verified through failure tests.

Event identity and intent identity must remain distinct. One identifies the event; the other identifies one logical transaction action. Whether one event permits multiple intentional transaction actions remains a business-rule decision.

### 3.4 Decision: Make interaction states depend on observable evidence

**Proposed decision:** The interaction component will expose states that distinguish gesture recognition, intent creation, waiting for phone receipt, backend processing, confirmed outcome, and unknown outcome.

Transitions must be driven by observable inputs or explicitly defined timeout policies.

The evidence required for each transition is:

- Gesture recognition: confirmation from the selected watch input mechanism.
- Intent creation: confirmation from the intent component under the agreed storage guarantee.
- Phone receipt: the acknowledgment defined by the Stage 4 relay contract.
- Backend processing: an authoritative status or acknowledgment from the backend processing interface.
- Transaction outcome: a validated authoritative result from the transaction component.

A successful transport write, local timeout, reconnect, or missing response cannot independently establish phone receipt, transaction execution, success, or failure.

**Reason:** Delivery and execution are different events. The watch must not infer a stronger state than the system has demonstrated.

**Consequence:** The interaction state machine must map to the real interfaces and acknowledgment semantics established by the other components. Unknown or missing evidence must remain distinguishable from confirmed failure.

### 3.5 Decision: Preserve uncertain outcomes and reconcile the existing intent

**Proposed decision:** If communication is interrupted after a transaction request may have reached the backend, the interaction component will represent the result as unknown until authoritative information resolves it.

The component will preserve the existing intent identity and use the transaction component's status-query or reconciliation mechanism where available. It will not create a replacement intent merely because an outcome message or acknowledgment is missing.

**Reason:** The backend may have executed a transaction even if the watch never receives the result. Treating a timeout as failure and submitting a fresh transaction could cause duplicate execution.

**Consequence:** The transaction-processing component must provide a defined means of checking or reconciling an existing intent's status. If that capability is unavailable, the limitation and safe recovery behavior must be documented before implementation is considered complete.

### 3.6 Decision: Keep event eligibility separate from backend authorization

**Proposed decision:** The watch interaction component will perform local eligibility checks using available event validity and interaction state. The backend remains responsible for authoritative authorization and business-rule enforcement.

The interaction component must not assume that every event permits only one transaction. Rules for deliberate repeat actions must be defined separately from duplicate prevention.

An expired event cannot become valid merely because the watch reconnects or the interface is reopened. Whether an intent created before event expiry may still be processed is determined by the applicable transaction rules.

**Reason:** Local UI state may be stale, incomplete, or interrupted. It cannot replace authoritative validation.

**Consequence:** Event expiry, permitted actions, and repeat-action rules must be defined by the relevant business and transaction components. Unresolved rules must be recorded explicitly rather than invented by the interaction layer.

### 3.7 Decision: Measure latency across component boundaries

**Proposed decision:** The interaction component will emit correlated timing observations for gesture recognition, eligibility checks, intent creation, and intent handoff.

The relay and backend must expose corresponding timing observations where available, including phone receipt, backend request receipt, processing, and outcome communication.

Measurements must retain stable event and intent identities across retries. Local elapsed durations should use monotonic clocks. Cross-device wall-clock comparisons must account for clock offset and uncertainty.

Missing timestamps must be reported as diagnostic gaps rather than used to estimate unobserved stages.

**Reason:** The assessment reports a delay exceeding eight seconds, but its cause has not been established. Measuring component boundaries separately helps identify where time is actually spent.

**Consequence:** The implementation needs a consistent diagnostic event contract and correlation identifiers across the watch, phone, relay, and backend. No latency improvement is claimed until measurements establish a baseline and verification demonstrates a change.

## 4. Alternatives considered

### Alternative A: Create a new intent whenever a double tap is recognized

**Decision:** Rejected.

This approach would make repeated taps, delayed responses, and recovery after process interruption capable of creating additional logical intents. It does not provide a safe way to distinguish a lost response from a failed creation request.

### Alternative B: Treat successful transport transmission as confirmed phone receipt

**Decision:** Rejected.

A transport write indicates that a transport operation succeeded according to its contract. It does not independently prove that the receiving application validated and durably recorded the intent.

The interaction component must use the acknowledgment defined by the relay contract.

### Alternative C: Treat timeout as transaction failure and allow immediate resubmission

**Decision:** Rejected.

A transaction may have completed even when its outcome communication was lost. A timeout does not prove that execution failed.

The system must preserve the original identity and resolve the existing transaction's status before creating a new logical action for the same intended transaction.

### Alternative D: Let the watch interaction component implement its own BLE retries and backend transaction logic

**Decision:** Rejected.

Duplicating relay and transaction-processing responsibilities would create competing recovery rules and make it harder to identify which component owns delivery, deduplication, execution, and outcome resolution.

Those responsibilities remain with the Stage 4 relay and backend transaction-processing component.

### Alternative E: Treat the event identity as the only transaction identity

**Decision:** Rejected as a general design rule.

An event may permit more than one intentional transaction under the applicable business rules. Event identity alone cannot safely represent every logical transaction action.

The design uses a distinct stable intent identity and leaves the permitted number of actions per event to explicit business rules.

### Alternative F: Select a specific watch input API and persistence technology now

**Decision:** Deferred.

The target watch platform, supported software versions, application framework, and available storage mechanisms have not been established in the current design evidence.

The input API and storage technology must be selected after compatibility and implementation constraints are confirmed. This deferral does not remove the requirements for stable identity, safe recovery, and an explicit durability guarantee.

## 5. Consequences

### Positive consequences

- Gesture recognition, intent creation, delivery, and transaction execution have distinct responsibilities.
- The same logical action can be recovered without automatically creating a replacement intent.
- The interface can distinguish confirmed states from unknown outcomes.
- Duplicate prevention does not depend solely on a temporary UI guard.
- The design supports measurement of latency across the watch, phone, relay, and backend.
- Component contracts and failure cases can be tested independently and as part of an end-to-end flow.

### Costs and limitations

- The design requires explicit intent-creation, status-query, and acknowledgment contracts.
- Stable identity and recovery state must be preserved according to the selected storage guarantees.
- Diagnostic correlation requires compatible identifiers and timestamps across components.
- Business rules for event expiry and intentional repeat actions must be clarified.
- Target-device compatibility, physical BLE behavior, accessibility, and end-to-end performance remain unverified.

## 6. Verification requirements

The following verification work is required. None of these tests is claimed to have been executed.

1. Verify that the selected watch input mechanism recognizes the required double tap.
2. Verify that invalid, ineligible, and expired interactions do not create unauthorized intents.
3. Verify that repeated local input does not create multiple intents for the same logical action.
4. Verify that an intent has the documented durability guarantee before creation is reported as durable.
5. Simulate a successful intent-creation request whose response is lost, then verify that create-or-retrieve returns the existing intent.
6. Interrupt and restart the application, then verify recovery using the same logical interaction identity.
7. Verify that a transport write alone does not advance the interaction to confirmed phone receipt.
8. Verify that a delayed or duplicate acknowledgment does not create another intent or produce an invalid state transition.
9. Verify that the UI does not report success before an authoritative transaction outcome is received and validated.
10. Simulate a transaction that executes while its outcome communication is interrupted, then verify that recovery reconciles the existing intent rather than creating a replacement.
11. Verify that event expiry and deliberate repeat-action behavior follow the defined business rules.
12. Verify that timing observations can be correlated across watch, phone, relay, and backend for the same intent.
13. Verify that diagnostic measurements distinguish locally measured durations from uncertain cross-device clock comparisons.
14. Run the end-to-end double-tap-to-outcome test under normal operation, disconnection, interruption, duplicate delivery, delayed acknowledgment, and uncertain outcome conditions.
15. Record the environment for each result, distinguishing simulation, emulator, and physical-device testing.

Test evidence must record the test conditions, observed results, failures, and limitations. A planned test is not evidence of successful behavior.

## 7. Requirement traceability

| Requirement ID | Decision coverage                                                                                       | Verification evidence                                   |
| -------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `REQ-ARCH-001` | Component boundaries and watch engagement responsibilities                                              | Integrated architecture and implementation review       |
| `REQ-ARCH-004` | Double-tap initiation, delivery/execution distinction, interruption recovery, and outcome communication | End-to-end interaction and transaction-flow tests       |
| `REQ-DIAG-003` | Correlated timing observations across watch, phone, relay, and backend                                  | Reproducible latency trace and measured stage durations |
| `REQ-DIAG-005` | Observable state transitions and diagnostic evidence                                                    | Diagnostic scenario records and before/after evidence   |
| `REQ-TEST-003` | Stable intent identity, retries, duplicates, interruption, and uncertain outcomes                       | End-to-end transaction-intent test results              |
| `REQ-TEST-004` | Reproduction of applicable diagnostic scenarios                                                         | Reproducible scenario results                           |
| `REQ-TEST-006` | Demonstration of the interaction and recovery path                                                      | Recorded reproducible demonstration                     |
| `REQ-TEST-007` | Separation of simulation, emulator, and physical-device evidence                                        | Test environment and result records                     |
| `REQ-TRACE`    | Mapping from requirements to design, implementation, and verification                                   | Updated assessment traceability document                |

These mappings describe intended coverage. They do not establish implementation or verification completion.

## 8. Unresolved decisions

The following decisions remain open:

1. Target watch platform, model, and supported software versions.
2. Supported double-tap input API and gesture configuration.
3. Intent storage technology and exact durability guarantee.
4. Stable interaction identity generation and atomic create-or-retrieve implementation.
5. Persisted interaction state and recovery behavior after process interruption.
6. Exact TypeScript interfaces between the interaction, intent, relay, and transaction components.
7. Business rules for event expiry and multiple intentional actions per event.
8. Transaction status-query or reconciliation interface for uncertain outcomes.
9. Feedback wording, screen layout, and accessibility behavior.
10. Diagnostic event schema, timestamp conventions, and cross-component correlation.
11. Availability of a physical watch and the environment required for end-to-end verification.

These decisions must be resolved or explicitly documented as assumptions before the relevant implementation and verification work is considered complete.

## 9. References

- `docs/research/watch-interaction-research.md`
- `docs/design/watch-interaction.md`
- `docs/research/phone-to-watch-relay-research.md`
- `docs/design/phone-to-watch-relay.md`
- `docs/decisions/ADR-004-phone-to-watch-relay.md`
- `docs/requirements/assessment-requirements.md`
- `docs/requirements/assessment-traceability.md`

## 10. Decision status

This ADR records the proposed design direction for Stage 5. It does not claim that the interaction component, intent persistence, deduplication, transaction recovery, physical watch integration, or end-to-end behavior has been implemented or verified.

The decisions may be accepted or revised when the relevant platform, interface, and storage constraints are confirmed. Any material change must preserve traceability to the assessment requirements and document its effect on the design and verification plan.
