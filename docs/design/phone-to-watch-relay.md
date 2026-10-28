# Phone-to-Watch Relay Design

**Project:** Clockit — Real-Time Event-to-Transaction Streaming Infrastructure
**Component:** Phone-to-watch relay
**Stage:** 4 — Phone-to-Watch Relay
**Status:** Proposed; implementation and verification pending
**Date:** 28 October 2026

## 1. Purpose

The phone-to-watch relay transfers backend events from the Android phone to the smartwatch and returns watch-generated transaction intents to the phone.

The relay must handle interrupted connections, repeated delivery, process restarts, and uncertain acknowledgment outcomes without silently losing pending work or creating duplicate logical actions.

The relay is a communication component. It does not authorize financial transactions or independently determine whether a transaction succeeded.

## 2. Scope

### Included

- A transport interface supporting a deterministic simulated transport and a planned BLE GATT implementation.
- Event transfer from phone to watch.
- Watch-to-phone acknowledgment messages.
- Watch-to-phone transaction-intent transfer.
- Stable event and intent identifiers.
- Durable pending-item storage where required for process-restart recovery.
- Retry, duplicate detection, expiry, and reconnection behavior.
- Lifecycle callbacks, metrics, and deterministic tests.
- Clear separation between transport receipt, application receipt, user interaction, and transaction execution.

### Excluded

- Backend event creation and publication.
- Backend-to-phone event delivery and its acknowledgment contract.
- The phone's backend connection manager and adaptive heartbeat algorithm.
- Backend authorization, transaction execution, and financial ledger updates.
- Claims that physical BLE connections survive process death or that every supported smartwatch has been verified.

These components interact with the relay through explicit interfaces.

## 3. Proposed architecture

The relay has five responsibilities:

1. Accept an eligible event from the phone's backend-delivery component.
2. Store the event in a durable pending queue before attempting transfer.
3. Send the event through the selected transport.
4. Process a valid watch acknowledgment and update the pending record.
5. Accept transaction intents from the watch, preserve their identity, and hand them to the phone's transaction-intent component.

The proposed component structure is:

- **Relay coordinator:** owns transfer state and coordinates retries.
- **Transport adapter:** sends and receives messages through simulated transport or BLE GATT.
- **Pending-item store:** retains events and transaction intents until the relevant acknowledgment or terminal policy applies.
- **Protocol validator:** checks message shape, identifiers, versions, and required fields.
- **Duplicate guard:** recognizes repeated event and intent identifiers.
- **Observer interface:** exposes lifecycle callbacks and diagnostic metrics.

The relay coordinator must not depend on BLE-specific implementation details. The transport adapter provides the same application-level contract to the coordinator regardless of whether a test uses simulation or a physical connection.

## 4. Message contract

All application messages must have a versioned envelope. The initial proposed envelope contains:

- `protocolVersion`: identifies the message contract version.
- `messageId`: uniquely identifies this transfer message.
- `messageType`: identifies the event, acknowledgment, transaction intent, or intent acknowledgment.
- `eventId`: identifies the original backend event when applicable.
- `intentId`: identifies the logical transaction intent when applicable.
- `createdAt`: creation timestamp.
- `expiresAt`: optional event-expiry timestamp.
- `payload`: validated application data or a reference to that data.

The implementation must define strict validation rules before accepting a message. Unknown versions, missing required fields, invalid identifiers, and malformed payloads must not be treated as successful receipt.

The same logical event retains its `eventId` across transfer retries. The same logical transaction intent retains its `intentId` across retries.

A retry must not create a new logical event or transaction intent.

The exact serialization format, maximum message size, and GATT characteristic layout remain implementation decisions.

## 5. Event delivery protocol

### 5.1 Queue before sending

When the phone receives an eligible event, the relay validates it and writes a pending record to its configured store.

The relay must not rely on an in-memory queue as evidence of recovery after process death.

Only after the pending record is stored successfully may the relay attempt transport delivery.

### 5.2 Transfer to the watch

The relay sends the event through the transport adapter.

A successful transport write means only that the transport operation reported success. It does not establish that the watch application validated or stored the event.

### 5.3 Watch validation and receipt

The watch validates the envelope and checks the event identifier and expiry.

If the event is acceptable, the watch records the event using its own application storage and duplicate-detection mechanism.

The watch sends an application-level acknowledgment only after the storage operation required by the agreed protocol succeeds.

If the event has already been stored, the watch must recognize the repeated identifier and respond without creating a duplicate logical event.

### 5.4 Phone acknowledgment handling

The phone validates the acknowledgment and matches it to the pending event.

The phone marks the event as delivered only when the acknowledgment satisfies the agreed receipt contract.

If the acknowledgment is lost, the event remains pending. The relay may retry the same event ID.

A late acknowledgment must be checked against the current record and expiry policy before the record is changed.

### 5.5 Event expiry

An expired event must not be presented as a fresh actionable event.

Expiry must be checked when queuing, transmitting, and accepting an event where applicable.

Expiry does not prove that a previous transfer failed. The relay must retain enough state to distinguish an expired pending item from an item already acknowledged by the watch.

## 6. Transaction-intent protocol

A transaction intent is different from a backend event.

When a user performs the required interaction on the watch, the watch creates a uniquely identified intent and stores it before attempting transmission.

The phone validates the intent and durably stores it before sending the application acknowledgment.

The phone then hands the intent to the transaction-processing component. That component must enforce idempotency using the stable intent identity.

The relay may retry transmission, but it must not independently repeat transaction execution.

The following outcomes must remain distinct:

- Intent created on the watch.
- Intent durably received by the phone.
- Intent accepted for backend processing.
- Transaction execution confirmed by the authoritative backend.
- Confirmed outcome communicated to the watch.

A transport acknowledgment or phone receipt acknowledgment must never be reported as transaction success.

### 7.1 Pending-item states

Each pending item has one current durable state and a monotonically increasing attempt number.

- `PENDING`: stored and eligible for delivery.
- `IN_FLIGHT`: a specific transfer attempt has started.
- `AWAITING_ACK`: the transport attempt completed, but the required application acknowledgment has not been accepted.
- `ACKNOWLEDGED`: a valid application acknowledgment confirms the required receipt boundary.
- `EXPIRED`: the item's validity period ended before a qualifying acknowledgment was recorded.
- `FAILED_TERMINAL`: a documented terminal policy stopped further attempts.

### 7.2 State transitions

| Current state            | Trigger                                                 | Next state        | Required action                                                              |
| ------------------------ | ------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `PENDING`                | Scheduler selects eligible item                         | `IN_FLIGHT`       | Increment and persist the attempt number before sending                      |
| `IN_FLIGHT`              | Transport reports send completion                       | `AWAITING_ACK`    | Persist the attempt result and start the acknowledgment deadline             |
| `IN_FLIGHT`              | Transport reports failure or disconnect                 | `PENDING`         | Persist the failure and schedule a bounded retry, unless expired or terminal |
| `AWAITING_ACK`           | Valid acknowledgment for the item arrives               | `ACKNOWLEDGED`    | Persist acknowledgment and stop retries                                      |
| `AWAITING_ACK`           | Acknowledgment deadline expires                         | `PENDING`         | Record timeout and schedule a bounded retry, unless expired or terminal      |
| Any nonterminal state    | Expiry policy determines the item is no longer eligible | `EXPIRED`         | Stop new sends and retain the outcome according to retention policy          |
| Any retry-eligible state | Configured terminal policy is reached                   | `FAILED_TERMINAL` | Stop automatic retries and preserve diagnostic information                   |

`ACKNOWLEDGED`, `EXPIRED`, and `FAILED_TERMINAL` are terminal for automatic delivery. A separate, explicit recovery or administrative operation is required to change a terminal record.

An acknowledgment received after an item enters `EXPIRED` or `FAILED_TERMINAL` must be handled under Section 7.5. It records late receipt evidence but does not change the item's terminal state. Duplicate valid acknowledgments for an `ACKNOWLEDGED` item are idempotent and must not restart delivery.

### 7.3 Attempt identity and late callbacks

Each send attempt must have an attempt identifier or monotonically increasing attempt number associated with the item's stable event or intent ID.

A callback that belongs to an older attempt must not overwrite the current attempt's state or schedule a second retry.

A valid application acknowledgment is matched to the stable item ID and the agreed acknowledgment contract, not accepted merely because a transport callback succeeded.

If a valid acknowledgment arrives after a retry has begun, the relay must atomically record `ACKNOWLEDGED` and prevent further sends for that item. Any already-started duplicate transfer may still complete; the receiver must deduplicate it using the stable item ID.

If an acknowledgment arrives after the item has expired, the relay must record the receipt evidence without silently rewriting history. The policy for late receipt after expiry must be explicit and must not make the expired event actionable again.

### 7.4 Atomicity and restart recovery

The state change and its associated attempt metadata must be persisted together. After a process restart, an item found in `IN_FLIGHT` must be treated as an uncertain attempt, not proof of success or failure. Recovery must move it back to a retry-eligible state or apply the expiry/terminal policy.

The relay must not delete a pending record simply because a send call returned successfully. Deletion or compaction is permitted only after the required acknowledgment and retention rules have been satisfied.

### 7.5 Acknowledgments after terminal states

An acknowledgment received after an item has entered `EXPIRED` or `FAILED_TERMINAL` must be validated and recorded as late receipt evidence, but must not automatically reactivate the item or make an expired event actionable.

The relay must preserve both facts when supported by the evidence: the item reached a terminal delivery state, and the receiver later reported receipt. These facts must not be collapsed into a false claim that delivery was acknowledged before expiry.

For `ACKNOWLEDGED`, duplicate valid acknowledgments are idempotent: they must not create another logical delivery or restart retries.

The implementation must define the retention and audit fields required to preserve late-receipt evidence. A separate recovery action, if permitted, must be explicit and must not silently change the original delivery history.

## 8. BLE GATT transport boundary

The planned physical transport uses BLE GATT, subject to verification that the target watch supports the required roles and operations.

The transport adapter must expose operations equivalent to:

- Establish a connection.
- Discover and validate the expected service and characteristics.
- Send a protocol message.
- Deliver received protocol messages to the relay coordinator.
- Report connection and transfer errors.
- Close the connection and release owned resources.

The GATT service and characteristic UUIDs, client/server roles, write mode, notification configuration, payload limits, and message framing must be defined for the actual target device.

The transport must not interpret a successful GATT operation as proof of durable application receipt.

A transport disconnection must be surfaced to the coordinator so pending work can be preserved and recovered.

The simulated transport must reproduce relevant conditions deterministically, including delayed acknowledgment, lost acknowledgment, disconnection during transfer, duplicate delivery, and reconnection.

## 9. Security and validation

The relay must validate message structure, protocol version, identifiers, expiry, and message type before accepting data.

The implementation must establish how the phone and watch are associated with one another and how unauthorized devices or messages are rejected.

It must not treat pairing alone as proof that every received application message is authorized.

Sensitive transaction information should be minimized in transferred payloads. Authentication, authorization, and transaction approval remain responsibilities of the appropriate security and backend components.

The final design must document the selected device-association and message-protection mechanisms before physical implementation is considered complete.

## 10. Observability

The relay should expose callbacks or structured diagnostic events for:

- Transport connected and disconnected.
- Event queued.
- Transfer started.
- Transfer operation completed or failed.
- Application acknowledgment received or rejected.
- Retry scheduled and executed.
- Event acknowledged, expired, or terminally failed.
- Transaction intent received and queued.
- Recovery started and completed.

Useful metrics include:

- Pending event and intent counts.
- Transfer attempts and failures.
- Acknowledgment latency.
- Retry count and oldest pending-item age.
- Duplicate messages detected.
- Expired and terminally failed items.
- Connection recovery duration.

Logs should correlate the same logical event or intent across retries without exposing unnecessary sensitive payload data.

## 11. Verification plan

The following tests are planned. They have not yet been executed.

1. A valid event is stored and transferred successfully.
2. The watch acknowledges only after satisfying the agreed application receipt contract.
3. A missing acknowledgment causes a retry with the original event ID.
4. Repeated delivery does not create duplicate logical events.
5. A disconnect during transfer preserves pending work.
6. Reconnection resumes eligible pending work.
7. Phone process restart recovers pending records from persistent storage.
8. Watch process restart preserves the documented event and intent state.
9. Expired events are not treated as fresh actionable events.
10. Invalid protocol versions and malformed messages are rejected.
11. A transaction intent retains the same identity across retries.
12. Repeated intent delivery does not result in repeated logical execution when integrated with the backend idempotency contract.
13. A transaction outcome is not reported as successful merely because the intent was received.
14. Late acknowledgments do not corrupt newer item state.
15. Stop and shutdown operations release transport resources without deleting pending work.
16. The simulated transport reproduces the required failure scenarios deterministically.
17. Physical-device tests verify actual GATT compatibility, connection recovery, message behavior, and device lifecycle effects.

Every test result must identify the environment used: simulation, emulator, or physical device. No test is considered passed until evidence is recorded.

## 12. Traceability

This component contributes to the following assessment requirements:

| Requirement ID | Design coverage                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `REQ-ARCH-001` | Phone-to-watch communication is represented as a distinct transport boundary in the overall architecture.                             |
| `REQ-ARCH-004` | Event delivery, transaction-intent transfer, interruption, retry, and the distinction between intent receipt and transaction outcome. |
| `REQ-CONN-006` | Pending-item storage, acknowledgment, retry, interruption recovery, and stable identifiers for duplicate-safe delivery.               |
| `REQ-CONN-007` | Relay lifecycle and delivery observations exposed through the component's observer interface.                                         |
| `REQ-CONN-010` | BLE liveness is kept separate from backend connection liveness.                                                                       |
| `REQ-CONN-011` | Deterministic transport simulation and reproducible verification scenarios.                                                           |
| `REQ-DIAG-002` | Process-death and delayed-delivery recovery, where the relay's own pending work is affected.                                          |
| `REQ-DIAG-005` | Diagnostic evidence, failure analysis, corrective actions, and verification results.                                                  |
| `REQ-TEST-001` | Communication failure and recovery tests.                                                                                             |
| `REQ-TEST-002` | Process-death and pending-event recovery tests.                                                                                       |
| `REQ-TEST-003` | Transaction-intent retries, duplicate delivery, uncertain outcomes, and delivery-versus-execution distinction.                        |
| `REQ-TEST-004` | Reproduction and verification of relevant failure scenarios.                                                                          |
| `REQ-TEST-006` | Reproducible demonstration using the simulated transport.                                                                             |
| `REQ-TEST-007` | Test evidence identifying simulation, emulator, or physical-device environments.                                                      |
| `REQ-TRACE`    | Mapping assessment requirements to design, implementation, and verification evidence.                                                 |

These entries identify intended coverage, not proof of completion. Implementation, automated tests, and physical-device verification remain pending. Requirements that depend on the wider system must also be verified at integration level.

## 13. Open decisions

The following remain unresolved:

1. Exact smartwatch model, platform, and supported Android versions.
2. BLE GATT client/server roles and service/characteristic contract.
3. Message serialization and maximum supported payload size.
4. Exact acknowledgment message schema and wire fields. The receipt boundary is defined: the receiving device must validate the item and durably store it before sending the application acknowledgment. The acknowledgment must identify the stable item ID and message type so the sender can match it to the correct event or intent.
5. Event and intent storage implementation on each device.
6. Retry delays, attempt limits, expiry, and retention rules.
7. Device association, authentication, and message protection.
8. Ordering requirements when multiple events are pending.
9. Whether the assessment requires physical BLE implementation or accepts a simulated transport for part of verification.
10. Physical-device availability and test coverage.

These decisions must be resolved or explicitly recorded as assumptions before claiming implementation completeness.

## 14. Design conclusion

The relay is designed as an application-level delivery protocol over a replaceable transport boundary.

Stable identifiers, durable pending state, explicit acknowledgments, duplicate handling, and recovery are required to handle interrupted communication safely.

BLE GATT is the intended physical transport, but device compatibility and physical behavior remain unverified.

**Status:** Proposed design. No implementation or verification results are claimed.
