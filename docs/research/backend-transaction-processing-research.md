# Backend Transaction-Intent Processing, Execution, and Outcome Communication Research

**Project:** Clockit — Real-Time Event-to-Transaction Streaming Infrastructure
**Component:** Backend transaction-intent processing, execution, and outcome communication
**Stage:** 6 — Backend transaction processing
**Status:** Research documented; design, implementation, and verification pending
**Date:** 28 October 2026

## 1. Purpose

This document researches the engineering responsibilities required to receive a transaction intent from the phone, determine whether it may be processed, prevent duplicate execution, resolve the transaction outcome, and communicate that outcome to the watch.

The assessment requires an end-to-end flow initiated by a smartwatch double tap. It also requires investigation of interrupted requests, duplicate delivery, uncertain transaction outcomes, and cases where a transaction completes but its outcome is not communicated.

The research distinguishes documented engineering principles from proposed Clockit behavior. It does not claim that Clockit currently has a transaction processor, database, ledger, external payment provider, or production execution system.

## 2. Scope and boundaries

This component begins when the backend receives a transaction-intent request and ends when the transaction's authoritative outcome is made available for communication to the caller.

Its research responsibilities include:

- Receiving and validating transaction-intent requests.
- Identifying the logical transaction action and its owner.
- Rejecting unauthorized, invalid, expired, or otherwise ineligible requests.
- Preventing duplicate processing when requests are delivered or submitted more than once.
- Recording the transaction's processing state.
- Coordinating execution, whether simulated locally or delegated to an external system.
- Handling interruptions and ambiguous execution outcomes.
- Making the authoritative outcome retrievable after a lost response or process restart.
- Communicating transaction outcomes without confusing delivery acknowledgment with execution success.
- Producing evidence for diagnosis, testing, and end-to-end latency measurement.

The component does not own watch gesture recognition, BLE transport, phone connection management, or the delivery mechanism itself. Those responsibilities remain with their respective components.

The actual transaction type, execution provider, storage technology, and accounting requirements are not yet established.

## 3. Official and industry-source findings

### 3.1 Safe retries require a stable request identity

The AWS Builders' Library article _Making retries safe with idempotent APIs_ describes how a unique client request identifier allows a service to recognize retries of the same logical request.

It also discusses the importance of returning semantically equivalent results for repeated requests and handling requests whose first response was lost.

Source:
https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/

**Finding:** A transaction processor needs a documented rule for recognizing repeated submissions of the same logical transaction action.

**Implication for Clockit:** The backend must receive or establish a stable intent identity and define what happens when that identity is submitted again. A retry must not automatically be treated as a new transaction.

The identity alone is not sufficient. The backend must also define how it records processing state, coordinates execution, and handles concurrent requests.

### 3.2 Idempotency keys and resource identities solve different problems

Modern Treasury's idempotency guidance distinguishes request-level idempotency keys from external IDs used to identify resources. It explains that their retention and duplicate-prevention behavior differ.

Source:
https://www.moderntreasury.com/learn/idempotency

**Finding:** A temporary retry key and a durable business-resource identity are not interchangeable.

**Implication for Clockit:** Research must establish both:

- How the backend recognizes a repeated request during retry and recovery.
- How the system identifies and retrieves the existing transaction intent or transaction record over its required lifetime.

The exact identity fields, uniqueness scope, retention period, and database constraints remain design decisions.

### 3.3 Ledger correctness requires explicit consistency rules

Modern Treasury documents ledger guarantees including balanced debit and credit entries, atomic ledger-transaction writes, immutability of posted entries, and idempotency support.

Source:
https://docs.moderntreasury.com/ledgers/docs/ledgers-guarantees

**Finding:** When a system maintains a financial ledger, it needs explicit rules governing balance consistency, atomicity, auditability, and repeated writes.

**Implication for Clockit:** The design must first establish whether the assessment requires a financial ledger or only a simulated transaction record. If a ledger is required, its accounting invariants and posting rules must be researched explicitly.

The existence of a transaction status field does not establish that financial accounting is correct.

### 3.4 External execution and internal records are separate concerns

Modern Treasury documents how ledger transactions can be linked to payment objects and how externally executed payments can be represented in an internal ledger.

Source:
https://docs.moderntreasury.com/ledgers/docs/linking-ledger-transaction-to-payment-objects

**Finding:** An internal record can represent an operation performed by another system. Its state must reflect the external operation's actual lifecycle.

**Implication for Clockit:** If transaction execution is delegated to a provider, Clockit must define how provider identifiers, responses, status updates, and final outcomes are associated with the original intent.

A successful request sent to a provider does not by itself prove that the provider completed the transaction.

This finding does not establish that Clockit uses an external provider. That remains unknown.

### 3.5 Duplicate notifications require their own handling

Modern Treasury's idempotency guidance also describes deduplication of retried webhooks using a stable webhook identifier rather than a delivery-attempt identifier.

Source:
https://www.moderntreasury.com/learn/idempotency

**Finding:** Repeated delivery of the same notification must be distinguished from a new business event.

**Implication for Clockit:** If the transaction processor consumes asynchronous messages or provider callbacks, each message type needs an identity and duplicate-handling rule. A new delivery attempt must not automatically create a new transaction or repeat an already completed state transition.

## 4. Proposed behavioral questions to resolve in design

The research supports investigating the following questions. These are not yet approved implementation decisions.

### 4.1 Request acceptance

- What identifies one logical transaction intent?
- Which fields are required for the backend to validate the request?
- How does the backend authenticate the caller and verify authorization?
- How does it determine whether the intent is still eligible for processing?
- When does the backend consider the request accepted?
- What durable record must exist before acceptance is acknowledged?

### 4.2 Duplicate and concurrent requests

- What happens when the same intent is submitted twice?
- What happens when two workers receive the same intent concurrently?
- How is the identity associated with the original request preserved across retries?
- What happens if the same identity arrives with different transaction parameters?
- How long must duplicate protection remain effective?
- Can a legitimate new transaction action be distinguished from a retry of an existing action?

### 4.3 Execution and outcome

- Which component actually executes the transaction?
- Does execution happen locally, through a simulated adapter, or through an external provider?
- What evidence proves that execution started?
- What evidence proves success or failure?
- What happens when the execution request times out but may have reached the executor?
- How can the backend recover the existing transaction's status after a restart?
- How does the system expose a result after the original response is lost?

### 4.4 Outcome communication

- How does the caller retrieve the authoritative outcome?
- Can outcome communication be retried without repeating transaction execution?
- How are duplicate or out-of-order status notifications handled?
- How does the backend distinguish transaction failure from failure to communicate the result?
- How is the outcome correlated with the original intent and event?

## 5. Failure cases requiring design and tests

### 5.1 Duplicate request after a lost response

The backend receives and processes an intent, but its response does not reach the phone.

The caller retries the same intent.

The design must establish how the backend finds the existing request and returns or resumes its state without creating a second logical transaction.

### 5.2 Concurrent duplicate submissions

Two copies of the same intent reach different workers at nearly the same time.

The design must establish how identity uniqueness and concurrent processing are protected. A check performed separately from a later write may not be sufficient if both workers can pass the check before either writes.

### 5.3 Backend interruption during processing

The backend process stops after accepting the request but before the caller receives a response.

The design must establish which information survives the interruption and how processing resumes without losing the intent or creating an unintended duplicate.

### 5.4 Execution result is uncertain

The backend sends an execution request, but communication fails before the result arrives.

The design must distinguish:

- Evidence that execution was never started.
- Evidence that execution is in progress.
- Evidence that execution completed.
- An unresolved state where execution may have occurred.

The absence of a response is not sufficient evidence that execution failed.

### 5.5 Execution completed but outcome communication failed

The transaction completes, but the backend or network fails before the outcome reaches the phone and watch.

The design must provide a way to retrieve or communicate the existing outcome without executing the transaction again.

### 5.6 Duplicate or delayed provider notification

An external execution system sends the same callback more than once or delivers an older status after a newer one.

If external callbacks are part of the chosen architecture, the design must define message deduplication, allowed state transitions, and how stale information is prevented from overwriting authoritative current state.

### 5.7 Financial record inconsistency

If the assessment requires financial ledger behavior, a failure could occur between execution and internal accounting updates.

The design must establish which records are authoritative, how partial completion is detected, and how discrepancies are recovered or reconciled. The required behavior depends on the selected execution and accounting model.

## 6. State and evidence distinctions

Research indicates that the design must not collapse the following concepts into one status:

- **Request received:** the backend observed a request.
- **Request accepted:** the backend accepted it under its validation and persistence contract.
- **Processing:** the backend is working on the existing intent.
- **Execution submitted:** an execution request was issued to the selected executor.
- **Execution confirmed:** authoritative evidence establishes an execution result.
- **Outcome available:** the backend can provide the result to a caller.
- **Outcome communicated:** the intended recipient acknowledged the outcome under an explicitly defined communication contract.
- **Outcome unknown:** the available evidence cannot yet establish the execution result.

These are candidate distinctions for the design, not a finalized state machine. The actual states, legal transitions, and required evidence must be established before implementation.

## 7. Observability and latency investigation

The assessment reports that some double-tap intents take more than eight seconds to reach the backend. The cause has not been reproduced or confirmed.

The backend design should therefore investigate which timestamps and identifiers are required to separate:

1. Backend request arrival.
2. Request validation and acceptance.
3. Durable intent recording.
4. Processing queue delay, if a queue is used.
5. Execution submission.
6. Execution response or status resolution.
7. Outcome persistence.
8. Outcome delivery attempt and acknowledgment.

Each measurement must identify the event or intent to which it belongs. Retries should remain distinguishable from new logical transaction actions.

A timestamp missing from a trace is a diagnostic gap; it is not evidence that the corresponding stage took zero time.

The implementation should distinguish measured durations from cross-system estimates affected by clock offset.

No baseline latency, bottleneck, or improvement has been established by this research.

## 8. Verification questions

The later test plan should cover at least:

- A valid intent is accepted and processed.
- Invalid or unauthorized requests are rejected.
- Repeated requests with the same identity do not create a second logical transaction.
- Concurrent duplicates cannot both initiate unintended execution.
- Reusing an identity with conflicting parameters is handled explicitly.
- A lost acceptance response can be recovered safely.
- A backend restart does not lose accepted work.
- An interrupted execution request is resolved without blindly repeating a potentially completed operation.
- A completed transaction remains retrievable when its outcome response is lost.
- Duplicate and delayed notifications do not produce invalid state transitions.
- Outcome communication can be retried independently of transaction execution.
- Required timing observations can be correlated across the end-to-end flow.
- If ledger behavior is required, accounting invariants hold across successful execution, interruption, retry, and recovery.

These are planned verification targets. No implementation or test results are claimed.

## 9. Evidence status

### Documented from external sources

- AWS documents request identities and idempotent API behavior for safe retries.
- Modern Treasury documents the distinction between request idempotency and durable resource identity.
- Modern Treasury documents ledger consistency and immutability guarantees.
- Modern Treasury documents linking internal ledger transactions to external payment objects.
- Modern Treasury documents duplicate handling for webhook delivery.

### Established by the assessment

- A smartwatch double tap initiates the transaction-intent flow.
- The intent passes through the phone relay toward backend processing.
- The system must communicate the outcome.
- The assessment includes interrupted requests, duplicate delivery, uncertain outcomes, and transaction completion without outcome communication.
- Some intents reportedly take more than eight seconds to reach the backend, but the cause is unconfirmed.

### Not established

- Clockit's actual backend implementation.
- The transaction type and its business rules.
- Whether execution is simulated or delegated to a provider.
- Whether a financial ledger is required.
- The database, message broker, execution provider, and storage guarantees.
- The exact state machine, API contract, idempotency retention, and reconciliation mechanism.
- Any measured performance, implementation result, or test result.

## 10. Questions to resolve before design approval

1. What transaction behavior does the assessment expect to demonstrate: a simulated operation, a financial transaction model, or integration with an actual execution system?
2. What evidence does the assessment require for authoritative transaction success or failure?
3. Does the repository or assessment define a transaction API, schema, or existing backend service?
4. Is a ledger required, or is transaction-state persistence sufficient for the demonstrated scope?
5. What durable storage and execution guarantees can the selected environment actually provide?
6. What is the required recovery behavior when the executor's result is uncertain?
7. How long must intent identities and duplicate-protection records remain available?
8. Which requirement defines the expected outcome-communication path back to the watch?

These questions must be answered from the assessment, repository, official documentation, or explicit design decisions. Unknowns must remain visible rather than being silently converted into assumptions.

## 11. References

1. AWS Builders' Library — Making retries safe with idempotent APIs
   https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/

2. Modern Treasury — Idempotency: How It Prevents Duplicate Payments
   https://www.moderntreasury.com/learn/idempotency

3. Modern Treasury — Ledgers Guarantees
   https://docs.moderntreasury.com/ledgers/docs/ledgers-guarantees

4. Modern Treasury — Link Ledger Transaction to Payments
   https://docs.moderntreasury.com/ledgers/docs/linking-ledger-transaction-to-payment-objects

5. Clockit assessment requirements
   `docs/requirements/assessment-requirements.md`

6. Previous component decisions
   `docs/decisions/ADR-001-event-publication.md`
   `docs/decisions/ADR-002-backend-event-delivery.md`
   `docs/decisions/ADR-003-adaptive-connection-manager.md`
   `docs/decisions/ADR-004-phone-to-watch-relay.md`
   `docs/decisions/ADR-005-watch-interaction.md`

## 12. Conclusion

Backend transaction-intent processing must preserve the identity of a logical transaction action, handle repeated requests safely, distinguish request delivery from execution, and make an authoritative outcome recoverable when communication fails.

The specific state machine, persistence model, execution mechanism, ledger requirements, and recovery protocol remain unresolved. They must be established from the assessment and verified technical constraints before the component design is approved.

This document records research findings and proposed questions only. It does not claim that the component has been implemented or verified.
