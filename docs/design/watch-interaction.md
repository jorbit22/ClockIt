# Watch Interaction Design

**Project:** Clockit — Real-Time Event-to-Transaction Streaming Infrastructure
**Component:** Watch interaction and transaction-intent initiation
**Stage:** 5 — Watch interaction
**Status:** Proposed; implementation and verification pending
**Date:** 28 October 2026

## 1. Purpose

Define how the smartwatch recognizes the required double-tap interaction, determines whether the action is eligible, initiates one logical transaction intent, and communicates the resulting interaction state to the user.

The component must prevent accidental or repeated input from silently creating multiple logical intents. It must distinguish local gesture recognition from durable intent creation, delivery to the phone, backend transaction execution, and communication of the final outcome.

## 2. Scope and boundaries

### Included

- Double-tap recognition using a supported watch input mechanism.
- Eligibility checks against the currently displayed event and interaction state.
- Prevention of repeated local handling of the same logical interaction.
- Requesting creation of a transaction intent with a stable identity.
- Presenting feedback that reflects the actual known state.
- Recording timestamps and diagnostic events needed to investigate slow intent delivery.
- Recovering the user interface when delivery is delayed, interrupted, or uncertain.

### Excluded

- Backend event creation and backend-to-phone delivery.
- BLE transport, relay retries, and application acknowledgments owned by the Stage 4 relay.
- Backend authorization, transaction execution, and financial ledger updates.
- Independent claims that a transaction succeeded without authoritative outcome evidence.

## 3. Component responsibilities

The proposed component has four responsibilities:

1. **Gesture handler:** Recognizes a supported double tap and reports the interaction to the coordinator.
2. **Interaction coordinator:** Checks eligibility, prevents concurrent duplicate handling, and controls the interaction state.
3. **Intent handoff interface:** Requests creation or retrieval of a stable transaction intent from the transaction-intent component.
4. **Feedback and diagnostics:** Displays the current known state and emits correlated diagnostic timestamps.

The coordinator must not implement its own BLE delivery, backend retry, or transaction execution mechanism. Those responsibilities belong to the relay and transaction-processing components.

The gesture handler should use a platform-supported interaction mechanism where it satisfies the requirement. The exact API and input configuration remain open until the target watch and application framework are confirmed.

## 4. Eligibility and acceptance

A recognized gesture may be accepted only when all required local eligibility checks pass.

The proposed checks are:

- The intended event or action is currently displayed.
- The event has not expired according to the available validity information.
- The current interaction state permits the requested action.
- The screen and application state permit a new action.
- No conflicting local operation is already being accepted for the same logical interaction.
- Any required user confirmation has been completed.

The implementation must not treat local eligibility as backend authorization. The backend remains responsible for validating the intent and applying authoritative business rules.

The event identity identifies the event, not necessarily a unique transaction. Whether an event permits one or multiple intentional transactions must be established by the applicable business rules.

If a check fails, the coordinator rejects the interaction without creating a new intent and provides appropriate feedback where possible.

Local eligibility checks must not replace authoritative backend validation. If eligibility or expiry cannot be established from the available information, the component must follow an explicitly defined safe policy rather than assume the action is valid.

## 5. Interaction state

The proposed user-interaction states are:

- `READY`: An eligible event can accept a new interaction.
- `GESTURE_RECOGNIZED`: The input mechanism recognized a double tap.
- `ACCEPTING`: Eligibility is being checked and the intent-creation request is being processed.
- `INTENT_CREATED`: The intent component confirms that the intent and its stable identity have been durably recorded.
- `WAITING_FOR_PHONE`: The intent exists, but phone receipt has not been confirmed under the relay's acknowledgment contract.
- `PROCESSING`: The backend reports that the transaction request is being processed.
- `OUTCOME_CONFIRMED`: An authoritative transaction outcome has been received and validated.
- `OUTCOME_UNKNOWN`: Communication was interrupted or the available evidence cannot establish the transaction outcome.
- `REJECTED`: The interaction was not accepted.
- `EXPIRED`: The action is no longer eligible under the applicable validity rules.

These states describe the interaction and feedback layer. The implementation must map them to the actual states and evidence exposed by the intent, relay, and transaction components. It must not invent an acknowledgment or transaction state that those components do not provide.

If the selected storage mechanism cannot guarantee durable intent creation, the implementation must explicitly document the weaker guarantee and the resulting recovery limitation. It must not describe a memory-only record as durable.

### 5.1 State-transition rules

- `READY` may enter `GESTURE_RECOGNIZED` after a valid double tap.
- `GESTURE_RECOGNIZED` may enter `ACCEPTING` while eligibility checks run.
- `ACCEPTING` enters `INTENT_CREATED` only when the intent component confirms durable creation under the agreed storage contract.
- `ACCEPTING` enters `REJECTED` when a required eligibility check fails.
- `INTENT_CREATED` may enter `WAITING_FOR_PHONE` while phone receipt remains unconfirmed.
- `WAITING_FOR_PHONE` may enter `PROCESSING` only when the system provides evidence that backend processing has started.
- A validated authoritative transaction result may move the interaction to `OUTCOME_CONFIRMED`.
- A communication interruption that prevents determination of the transaction result may move it to `OUTCOME_UNKNOWN`.
- An expired action cannot return to `READY` for the same expired event without a new valid event or an explicitly defined recovery operation.
- After application restart, the interaction must recover the existing intent from persisted state or query the intent component using the same stable interaction identity. It must not create a replacement merely because the previous response was lost.

Each transition must identify its authoritative evidence source:

- Gesture recognition is established by the selected input mechanism.
- Intent creation is established by the intent component's creation result and storage guarantee.
- Phone receipt is established by the acknowledgment defined in the relay contract.
- Backend processing is established by a corresponding backend status or acknowledgment.
- Transaction completion is established by a validated authoritative outcome.
- A transport write, local timeout, missing response, or reconnect event cannot independently establish receipt, execution, success, or failure.

If required evidence is unavailable, the component must preserve the last substantiated state or expose an explicitly defined uncertain state. A timeout alone must not be interpreted as transaction failure.

## 6. Repeated input and duplicate protection

The interaction coordinator must prevent a second local intent-creation operation for the same logical interaction while that interaction is already being accepted or remains unresolved.

The coordinator should associate the accepted interaction with the event identity and the stable intent identity supplied by the intent component.

The design distinguishes three cases:

1. **Repeated local gesture:** The coordinator rejects or safely ignores extra input while the existing logical interaction is pending, unless the applicable business rule explicitly permits another action.
2. **Repeated intent delivery:** The Stage 4 relay and receiving components deduplicate using the stable intent identity.
3. **Repeated backend request:** The backend transaction component enforces idempotency so transport retries do not create multiple logical executions.

A local UI guard is not a substitute for durable deduplication or backend idempotency. The coordinator must not generate a fresh intent identity simply because an acknowledgment is delayed or the phone reconnects.

Before requesting intent creation, the interaction must have a stable identity for the logical action. The intent component must provide an atomic create-or-retrieve operation, or an equivalent mechanism, so repeating the same request after a timeout returns the existing intent rather than creating a new one.

The identity and deduplication rule must survive application interruption to the extent required by the selected storage design. If the interaction component cannot determine whether a previous creation request succeeded, it must query or reconcile using the same identity before attempting another creation.

Event identity identifies the event; intent identity identifies one logical transaction action. Duplicate protection must use the identity and business constraints appropriate to that action. The implementation must not assume that an event can support only one transaction unless the applicable business rule establishes that restriction.

A new intentional transaction must use a distinct identity only when the applicable business rule permits that action. The exact behavior for a deliberate second action on the same event remains an open business-rule decision.

## 7. Feedback and outcome communication

The user-facing message must reflect the strongest state supported by evidence.

| Known state                    | Permitted feedback meaning                                                      |
| ------------------------------ | ------------------------------------------------------------------------------- |
| Gesture recognized             | The double tap was recognized.                                                  |
| Intent durably created         | The action was recorded and can be recovered under the agreed storage contract. |
| Waiting for phone              | The action is waiting for phone receipt confirmation.                           |
| Backend processing confirmed   | The backend reports that the request is being processed.                        |
| Authoritative outcome received | Show the actual confirmed outcome.                                              |
| Outcome unknown                | The result could not yet be confirmed.                                          |
| Interaction rejected           | The action was not accepted.                                                    |
| Action expired                 | The action is no longer eligible under the applicable validity rules.           |

The application must not display transaction success based only on gesture recognition, local intent creation, a successful transport write, or phone receipt acknowledgment.

When the outcome is unknown, the interface should preserve the existing intent identity and avoid encouraging the user to initiate a second transaction as a workaround. It should provide an appropriate status and rely on the transaction component's reconciliation or status-query mechanism where available.

A confirmed failure must be distinguished from an unknown outcome. If the backend may have executed the transaction but its response was lost, the interaction remains uncertain until authoritative status information resolves it.

Exact message wording and screen layout remain to be selected for the target device.

## 8. Latency measurement and diagnostics

REQ-DIAG-003 reports that some double-tap intents take more than eight seconds to reach the backend. This is an assessment-reported symptom, not a confirmed local measurement.

The component should emit correlated timestamps for:

- `gesture_recognized_at`
- `eligibility_check_completed_at`
- `intent_creation_requested_at`
- `intent_created_at`
- `intent_handoff_requested_at`

The relay and backend must provide their own corresponding timestamps, including phone receipt, phone-to-backend transmission, backend request receipt, backend processing, and acknowledgment or outcome communication where available.

Each event and intent must retain stable identifiers across retries so measurements can be correlated. The implementation must define timestamp sources and clock assumptions.

Monotonic elapsed-time measurements should be used for local duration calculations. Wall-clock timestamps may be retained for cross-component correlation, but comparisons across devices or services must account for clock offset and uncertainty. They must not be treated as exact durations without synchronization evidence.

The end-to-end diagnostic record should correlate the stable intent identity with timestamps for watch intent creation, relay handoff, phone receipt, phone-to-backend transmission, backend request receipt, backend processing, and outcome communication, wherever those timestamps are available.

Measure intervals locally wherever possible. Cross-device wall-clock comparisons must account for clock offset and uncertainty; they must not be treated as exact durations without synchronization evidence. Missing timestamps must be reported as gaps rather than used to estimate unobserved stages.

Useful measurements include:

- Time from gesture recognition to completion of eligibility checks.
- Time spent creating or retrieving the intent.
- Time from intent handoff request to phone receipt acknowledgment.
- Time from phone receipt to backend request receipt.
- Time from backend receipt to processing status or authoritative outcome.
- Time from outcome availability to watch presentation.
- Retry counts, connection interruptions, and acknowledgment delays associated with the same intent.

The component should expose relevant failure and latency observations without logging unnecessary sensitive transaction data.

The implementation must not claim that the interaction layer alone explains or fixes the entire end-to-end delay.

## 9. Failure and recovery behavior

### 9.1 Phone-watch disconnection

The interaction layer must not report phone receipt when no qualifying acknowledgment exists. If the intent has already been durably created, it must preserve the stable intent identity and use the agreed relay contract for delivery and recovery.

A transport connection or successful BLE write does not prove that the phone application has received and durably recorded the intent.

### 9.2 Application interruption

An interrupted UI operation must not create a new logical intent on recovery merely because the previous result is unknown.

Recovery must load the existing interaction state from persisted storage or query the intent component using the same stable interaction identity. If the original creation result was lost, the component must retrieve or reconcile the existing intent rather than create a replacement.

If the selected implementation cannot preserve enough state to recover safely, that limitation must be documented and addressed in the implementation decision and verification plan.

### 9.3 Delayed acknowledgment

A delayed acknowledgment must update the existing interaction when it matches the correct stable intent identity and acknowledgment contract. It must not cause the coordinator to create another intent.

Duplicate acknowledgments must be handled idempotently. An acknowledgment must not be accepted as evidence of a stronger state than the acknowledgment contract defines.

### 9.4 Uncertain transaction outcome

If the backend may have executed the transaction but the outcome communication is missing, the UI must use `OUTCOME_UNKNOWN` or the equivalent state supported by the wider system.

The system must resolve the existing transaction status before initiating another logical transaction for the same intended action. Resolution should use the transaction component's status-query or reconciliation mechanism where available.

A retry to discover the existing outcome must retain the original intent identity. It must not silently become a new transaction request.

### 9.5 Expired event

An expired event cannot initiate a fresh transaction intent under the same expired authorization or validity conditions.

Expiry must follow the validity rules defined by the event and transaction components. Reopening the UI or reconnecting the watch must not silently extend event validity.

If an existing intent was created before expiry, the transaction component must determine whether that intent remains valid for processing. The watch must not infer cancellation or transaction failure solely from event expiry.

## 10. Interfaces and dependencies

The interaction component requires the following logical interfaces. Exact TypeScript types or platform-specific signatures will be established during implementation.

- **Gesture input:** Reports recognized double taps.
- **Event context:** Supplies event identity, validity, and eligibility information.
- **Intent creation:** Creates or retrieves the stable logical intent for an accepted interaction.
- **Intent status:** Provides the latest known intent and transaction status.
- **Feedback observer:** Receives state changes for presentation.
- **Diagnostic observer:** Receives correlated lifecycle and timing events.

The intent-creation interface must define what happens if the request is repeated after a timeout. It must support an atomic create-or-retrieve operation, or an equivalent mechanism, using the same stable logical interaction identity.

The interface must distinguish at least:

- Creation confirmed under the agreed storage guarantee.
- Existing intent retrieved.
- Request rejected by a defined rule.
- Result unknown because the creation request may have succeeded but its response is unavailable.

An unknown creation result must not automatically trigger creation with a new identity.

These interfaces must be compatible with the Stage 4 relay contract. No new relay acknowledgment semantics are introduced by this component.

The transaction-processing component remains responsible for authoritative authorization, transaction execution, idempotency enforcement, and outcome resolution.

## 11. Verification plan

The following tests are planned and have not yet been executed.

1. A valid double tap is recognized on the selected watch input mechanism.
2. An incomplete or invalid gesture does not create an intent.
3. A valid gesture on an ineligible or expired event is rejected.
4. Repeated taps while an interaction is pending do not create multiple intents for the same logical action.
5. Intent creation produces a stable identity and confirms the agreed persistence guarantee.
6. A creation request whose response is lost can retrieve the existing intent without creating a second one.
7. A delayed phone acknowledgment does not trigger a new intent.
8. Phone-watch disconnection preserves the existing intent for recovery.
9. An interrupted application recovers the existing interaction without creating a second logical intent.
10. A transaction outcome is not displayed as successful before authoritative confirmation.
11. An uncertain transaction outcome remains distinguishable from confirmed failure.
12. A late valid outcome updates the existing interaction without creating another intent.
13. Diagnostic timestamps can identify time spent in each locally measurable stage.
14. End-to-end correlation can connect watch, phone, and backend measurements for the same intent.
15. The complete watch-to-backend-to-outcome path is tested under normal, interrupted, duplicate, delayed-acknowledgment, and uncertain-outcome conditions.
16. Event expiry and the rules governing deliberate repeat actions are verified against the defined business rules.
17. Accessibility behavior is verified for the selected interaction mechanism.

Test evidence must identify whether the test used simulation, an emulator, or a physical watch and network. No successful behavior is claimed until results are recorded.

## 12. Requirement traceability

| Requirement ID | Intended design coverage                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `REQ-ARCH-001` | Watch engagement layer and its boundaries with the phone relay and transaction path.                 |
| `REQ-ARCH-004` | Double-tap interaction, intent initiation, failure recovery, and outcome communication.              |
| `REQ-DIAG-003` | Correlated latency measurements for watch, relay, phone, and backend stages of slow intent delivery. |
| `REQ-DIAG-005` | Diagnostic observations and evidence for relevant interaction failures.                              |
| `REQ-TEST-003` | End-to-end double-tap intent, retry, duplicate, interruption, and outcome tests.                     |
| `REQ-TEST-004` | Reproduction and verification of applicable diagnostic scenarios.                                    |
| `REQ-TEST-006` | Reproducible interaction demonstration.                                                              |
| `REQ-TEST-007` | Evidence distinguishes simulation, emulator, and physical-device results.                            |
| `REQ-TRACE`    | Intended mapping from requirements to design, implementation, and verification.                      |

These mappings express intended coverage. They do not establish implementation or test completion.

## 13. Open decisions

1. Exact watch platform, model, and supported software versions.
2. Actual input API and gesture-recognition configuration.
3. Required event eligibility and expiry rules.
4. Whether an additional confirmation step is required.
5. Exact intent-creation interface and stable interaction identity generation rules.
6. Storage mechanism and durability guarantee for intent creation.
7. How interaction state and stable identity survive process interruption.
8. Supported feedback messages and screen layout.
9. Exact status-query or reconciliation mechanism for uncertain outcomes.
10. Clock and timestamp conventions for cross-component latency measurement.
11. Business rules governing multiple intentional actions for the same event.
12. Availability of the target watch and physical-device test environment.

Open decisions must be resolved or explicitly documented as assumptions before implementation is considered complete.

## 14. Design conclusion

The watch interaction component recognizes the required double tap, applies local eligibility rules, and requests creation or retrieval of one stable transaction intent for the logical action.

Intent creation must have an explicit storage guarantee, and repeated requests must not silently create duplicate logical intents. Feedback must reflect evidence provided by the intent, relay, and transaction components. Transport recovery remains the relay's responsibility, while authoritative authorization, execution, idempotency enforcement, and outcome resolution remain the transaction-processing component's responsibility.

The design is proposed. Implementation, automated tests, end-to-end verification, and physical-watch behavior remain unverified.
