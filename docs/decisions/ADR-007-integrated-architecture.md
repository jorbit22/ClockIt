# ADR-007: Integrated Event-to-Transaction Architecture

**Status:** Proposed
**Date:** 28 October 2026

## Context

The assessment requires an end-to-end system that carries backend events to a phone and watch, accepts a transaction intent, processes the intent, and communicates the transaction outcome.

The six component designs define responsibilities for:

1. Backend event source and publication.
2. Backend-to-phone event delivery.
3. Adaptive phone connection management.
4. Phone-to-watch relay.
5. Watch interaction and transaction-intent initiation.
6. Backend transaction-intent processing, execution, and outcome communication.

These components must work together without confusing message delivery with transaction execution or user-visible outcome communication.

The existing component designs also identify unresolved cross-component questions, particularly pending-work ownership, acknowledgment semantics, stable identities, and recovery when a response is lost.

The integrated design is documented in `docs/design/integrated-architecture.md`. Its supporting research is documented in `docs/research/integrated-architecture-research.md`.

No integrated implementation or end-to-end verification has been established.

## Decision

Adopt the proposed integrated architecture documented in `docs/design/integrated-architecture.md`, subject to the unresolved decisions listed below.

The architecture will follow these principles.

### 1. Preserve component responsibilities

Each component owns a defined responsibility and exposes an explicit handoff contract.

Transport, connection recovery, watch interaction, transaction authorization, transaction execution, and outcome delivery remain separate responsibilities.

The implementation may use in-process modules or simulated dependencies initially, provided the boundaries remain testable.

### 2. Keep identities distinct and stable

Event IDs, device-delivery identities, relay message IDs, transaction intent IDs, execution-attempt IDs, and outcome references serve different purposes.

Retries preserve the identity of the logical work being retried.

An event ID must not automatically become a transaction intent ID. A new transport message or execution attempt must not automatically create a new logical transaction intent.

### 3. Define acknowledgments by completed work

An acknowledgment must identify the object being acknowledged and the milestone actually completed.

Publication acceptance, durable delivery work, phone inbox storage, watch application storage, backend intent acceptance, execution outcome persistence, and outcome receipt are distinct milestones.

A transport write or connection-level acknowledgment must not be interpreted as proof of durable application processing.

### 4. Assign ownership of pending work

Each pending-work record must have an authoritative owner and an explicit retry responsibility.

A handoff must use a durable receiver-side record and acknowledgment, or an explicitly defined atomic state transition where storage is shared.

The phone event inbox and phone-to-watch relay must not independently retry the same work without shared identity and defined responsibility.

### 5. Make retries safe through identity and receiver-side controls

Receivers must handle duplicate messages and requests according to the relevant identity and idempotency contract.

The backend must create or retrieve a transaction intent using its stable identity and reject conflicting parameters under that identity.

The design does not claim global exactly-once delivery or execution.

### 6. Preserve uncertain execution outcomes

A missing response or timeout does not prove that an execution failed.

The backend must preserve uncertainty until authoritative evidence resolves it. Recovery must inspect the existing intent and execution identity rather than blindly submitting a potentially completed transaction again.

A worker claim or lease alone does not guarantee that an external provider will execute an operation only once.

### 7. Separate execution from outcome communication

The backend must persist the authoritative outcome before treating it as durably available.

Outcome delivery is independently recoverable. If communication fails after execution succeeds, the transaction remains successful while outcome delivery remains pending or unresolved.

The watch must display only the strongest state supported by available evidence.

### 8. Treat mobile and capacity behavior as evidence-dependent

The architecture must distinguish simulated behavior from emulator, physical-device, carrier, manufacturer-specific, and production-scale evidence.

The design does not claim that a simulated connection proves Android process survival, BLE reliability, or support for 500,000 concurrent users.

## Alternatives considered

### Alternative A: One end-to-end component owns everything

Rejected because it would mix event publication, transport, user interaction, transaction execution, and recovery into one responsibility. That would make failure boundaries, ownership, and verification harder to establish.

### Alternative B: Treat successful transport as successful processing

Rejected because a successful socket write, BLE operation, or message submission does not prove that the receiving application durably stored or processed the message.

### Alternative C: Create a new transaction for every retry

Rejected because a lost response could cause the same logical user action to execute more than once.

### Alternative D: Treat a timeout as transaction failure

Rejected because execution may have completed even though the response was lost. The system must preserve uncertainty and reconcile the existing intent.

### Alternative E: Claim exactly-once execution from local idempotency or worker leases

Rejected because local deduplication and worker coordination do not independently establish whether an external execution took effect. Executor idempotency and authoritative status evidence must be considered where available.

### Alternative F: Fix all infrastructure choices before deterministic simulation

Not selected as a requirement for the initial simulation. Deterministic tests can validate identities, state transitions, retries, and recovery while real infrastructure decisions remain open. Simulation results must not be presented as proof of the untested infrastructure behavior.

## Consequences

### Positive consequences

- Component boundaries and handoff responsibilities are explicit.
- Delivery milestones are distinguishable.
- Stable identities support retry and recovery.
- Pending-work ownership can be reviewed and tested.
- Transaction uncertainty is represented rather than hidden.
- Outcome delivery can recover independently from execution.
- The architecture supports deterministic testing before platform-specific integration.

### Costs and limitations

- Each handoff requires a defined contract and observable state.
- Durable storage and acknowledgment handling introduce additional implementation work.
- Duplicate delivery and concurrent processing require careful testing.
- Reconciliation is necessary when execution status cannot be established immediately.
- Real Android, watch, carrier, and capacity behavior remains unverified until appropriate tests are performed.
- Some infrastructure and protocol choices remain open.

## Unresolved decisions

The following decisions remain open and must be resolved at the appropriate component or integration stage:

1. Event broker, outbox storage, and publication configuration.
2. Backend delivery transport and optional push-notification behavior.
3. Phone inbox and relay storage, ownership transfer, and retry mechanics.
4. Target watch platform and supported phone-to-watch transport.
5. Relay message schema, acknowledgment protocol, and expiry policy.
6. Transaction-intent API schema, authentication, authorization, and idempotency scope.
7. Execution adapter and any external provider's idempotency and status-reconciliation capabilities.
8. Backend concurrency-control mechanism and stale-worker recovery.
9. Outcome delivery, acknowledgment, and retrieval mechanism.
10. Concrete timeout, retry, retention, and backoff parameters.
11. Production telemetry and privacy requirements.
12. Physical-device, carrier, manufacturer-specific, and capacity-test environments.

These choices must be recorded in the relevant component decisions when resolved. This ADR does not imply that any of them have already been selected or implemented.

## Verification requirements

The decision is not verified until implementation and tests provide evidence.

Verification must include:

1. **Handoff durability:** interrupt each handoff and verify that pending work remains recoverable under its documented storage guarantee.
2. **Acknowledgment correctness:** verify that each acknowledgment is issued only after its defined milestone and is associated with the correct identity.
3. **Duplicate handling:** repeat event delivery, relay messages, and intent requests; verify that retries do not create unintended duplicate logical work.

4. **Concurrent processing and expired claims:** run competing workers, interrupt one worker during execution submission, allow its claim to expire, and then resume it after another worker has taken over. Verify that stale workers cannot overwrite newer authoritative state and that duplicate external execution is prevented by supported executor idempotency or resolved through authoritative status reconciliation. If neither can establish the result, verify that execution remains uncertain rather than being blindly resubmitted.

5. **Uncertain execution:** interrupt execution requests and responses; verify that unresolved execution is not automatically treated as failure or blindly resubmitted.
6. **Outcome recovery:** persist an outcome, interrupt delivery, and verify that the existing outcome can be recovered without creating a new intent.
7. **Connection recovery:** interrupt the backend connection and phone-to-watch transport independently; verify their states and recovery behavior remain distinct.
8. **Integrated diagnostics:** reproduce the applicable assessment failure scenarios and record diagnostic evidence, corrective actions, and retest results.
9. **Environment evidence:** identify whether each result came from simulation, an emulator, physical devices, an actual mobile network, or a capacity test.
10. **Capacity:** document workload assumptions, calculations, resource measurements, and results relevant to the 500,000-concurrent-user requirement.

No verification result is claimed by this ADR.

## Related artifacts

- `docs/research/integrated-architecture-research.md`
- `docs/design/integrated-architecture.md`
- `docs/design/event-source.md`
- `docs/design/backend-event-delivery.md`
- `docs/design/adaptive-connection-manager.md`
- `docs/design/phone-to-watch-relay.md`
- `docs/design/watch-interaction.md`
- `docs/design/backend-transaction-processing.md`
- `docs/requirements/assessment-requirements.md`
- `docs/requirements/assessment-traceability.md`
