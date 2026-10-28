# ADR-004: Phone-to-Watch Relay

**Project:** Clockit — Real-Time Event-to-Transaction Streaming Infrastructure
**Status:** Proposed
**Date:** 28 October 2026
**Decision scope:** Phone-to-watch event delivery and watch-to-phone transaction-intent relay

## 1. Context

Clockit requires a communication path between the Android phone and smartwatch.

The relay must deliver backend events to the watch and return transaction intents from the watch to the phone. Communication may be interrupted by disconnection, process death, delayed acknowledgments, or duplicate delivery.

A transport operation completing does not prove that the receiving application validated and durably stored a message. Likewise, receiving a transaction intent does not prove that the backend executed the transaction.

The assessment does not identify the exact smartwatch model or confirm its supported Bluetooth roles and capabilities. Physical transport compatibility therefore remains unverified.

## 2. Decision

Adopt an application-level relay protocol behind a replaceable transport interface.

The proposed approach is:

1. Use a deterministic simulated transport for initial development and reproducible failure testing.
2. Use Bluetooth Low Energy (BLE) Generic Attribute Profile (GATT) as the intended physical transport, subject to verification against the target watch.
3. Give every event and transaction intent a stable identifier that remains unchanged across retries.
4. Persist pending work and its delivery state so required messages can survive process death.
5. Require an application-level acknowledgment only after the receiving application has validated the message and durably stored it.
6. Make duplicate receipt safe through stable identifiers and receiver-side deduplication.
7. Keep event delivery, transaction-intent receipt, transaction execution, and transaction outcome as distinct states and responsibilities.
8. Expose delivery, acknowledgment, retry, expiry, and recovery observations for diagnosis and verification.

This is a proposed design decision. It does not establish that the relay has been implemented or that physical BLE communication has been tested.

## 3. Application-level delivery contract

The relay must preserve the following rules independently of the underlying transport:

- **Stable identity:** Retries use the original event or intent identifier.
- **Durable receipt:** The receiving application acknowledges only after validation and durable storage.
- **Duplicate safety:** Receiving the same logical item repeatedly must not create duplicate logical events or transaction executions.
- **Uncertain delivery:** A missing acknowledgment means receipt is unconfirmed; it does not prove the receiver did not store the message.
- **Recovery:** Pending work remains available for retry or explicit expiry/terminal handling after interruption or process restart.
- **Expiry:** An expired event must not silently become a fresh actionable event because it was delivered late.
- **Transaction safety:** Intent receipt or acknowledgment is not transaction success. The backend must enforce transaction idempotency and provide authoritative transaction outcomes.
- **Auditability:** Late acknowledgments and terminal delivery states must be recorded without silently rewriting the original delivery history.

The precise acknowledgment wire schema, serialization format, retry limits, expiry values, and retention periods remain to be specified.

## 4. Transport options considered

### Option A: BLE GATT

BLE GATT provides the intended direct phone-to-watch communication path and aligns with the assessment's Bluetooth requirements.

It requires a compatible GATT client/server arrangement, service and characteristic definitions, appropriate write and notification behavior, and device-specific verification.

**Disposition:** Intended physical transport. Compatibility and operational behavior remain unverified.

### Option B: Wear OS Data Layer

The Android Wear OS Data Layer provides APIs for exchanging data between supported phone and Wear OS applications. Its data and message APIs have different persistence and delivery characteristics.

It is platform-specific and cannot be assumed to apply to an unspecified smartwatch.

**Disposition:** Not selected as the default transport because the target watch platform is not established. Reconsider if the assessment's target device and platform make it more appropriate.

### Option C: Simulated transport

A simulated transport allows deterministic testing of acknowledgment loss, disconnection, delayed messages, duplicate delivery, and recovery without relying on physical hardware or carrier conditions.

It does not prove that real BLE communication, Android lifecycle behavior, or target-watch compatibility works.

**Disposition:** Selected for initial development and reproducible testing, with the limitation that simulation results are not physical-device verification.

## 5. Storage and state management

The relay must maintain pending-item state, attempt metadata, expiry information, and acknowledgment evidence.

The state change and related attempt metadata must be persisted consistently. After a process restart, an interrupted transfer is uncertain; it must not be treated as successful merely because a send operation previously returned.

The design uses these delivery states:

- `PENDING`
- `IN_FLIGHT`
- `AWAITING_ACK`
- `ACKNOWLEDGED`
- `EXPIRED`
- `FAILED_TERMINAL`

`ACKNOWLEDGED`, `EXPIRED`, and `FAILED_TERMINAL` are terminal for automatic delivery. Late acknowledgment evidence must not automatically reactivate an expired or terminally failed item.

The actual storage technology on each device remains open. Any implementation that claims process-death recovery must demonstrate that the required pending state survives process death. In-memory storage alone cannot establish that guarantee.

## 6. Security boundaries

The relay must validate message structure, protocol version, message type, identifiers, and expiry before accepting a message.

Device association and message authorization must not rely solely on the fact that Bluetooth pairing occurred. The final implementation must specify and verify its device-association and message-protection mechanisms.

Sensitive transaction data should be minimized in transit. Authentication, authorization, transaction approval, execution, and authoritative transaction outcomes remain responsibilities of the appropriate application and backend components.

## 7. Consequences

### Benefits

- Separates application-level delivery guarantees from transport behavior.
- Makes retries and duplicate handling explicit.
- Supports deterministic failure testing before physical hardware is available.
- Creates a clear boundary between event delivery and financial transaction execution.
- Allows the transport implementation to change without redefining the application-level message contract.

### Costs and limitations

- Durable storage and receiver-side deduplication add implementation work.
- Application acknowledgments, expiry, retries, and late-receipt handling require explicit policies.
- BLE GATT roles, characteristics, payload limits, and device lifecycle behavior remain to be verified.
- Simulated success cannot establish physical-device compatibility or reliability.
- Exactly-once transaction execution cannot be guaranteed by the relay alone; it depends on the backend transaction and idempotency contract.

## 8. Verification required

Before claiming implementation completeness, verify:

1. Valid events are stored and delivered using stable identifiers.
2. Application acknowledgment follows validation and durable receipt.
3. Lost acknowledgments and interrupted transfers cause safe retry behavior.
4. Duplicate events and intents are handled without duplicate logical execution.
5. Pending work survives the required process-death and restart scenarios.
6. Expiry, terminal failure, and late acknowledgments preserve delivery history.
7. Transaction-intent receipt is never reported as transaction success.
8. The simulated transport reproduces the defined failure scenarios deterministically.
9. Physical-device tests establish the target watch's GATT compatibility and relevant lifecycle behavior.
10. Each result records its environment and supporting evidence.

No implementation or verification results are claimed by this ADR.

## 9. Open decisions

The following remain unresolved:

- Exact smartwatch model, platform, and supported Android versions.
- BLE GATT roles and service/characteristic definitions.
- Message serialization and payload limits.
- Exact acknowledgment schema and wire fields.
- Storage technology on the phone and watch.
- Retry delays, attempt limits, expiry, and retention values.
- Device association, authentication, and message-protection mechanisms.
- Message ordering requirements.
- Physical-device availability and required coverage.
- Whether the assessment accepts simulation for any portion of verification that otherwise requires physical BLE implementation.

These decisions must be resolved or explicitly recorded as assumptions before the corresponding implementation is considered complete.

## 10. References

- Android Developers, Bluetooth Low Energy overview: https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview
- Android Developers, Transfer BLE data: https://developer.android.com/develop/connectivity/bluetooth/ble/transfer-ble-data
- Android Developers, BLE background behavior: https://developer.android.com/develop/connectivity/bluetooth/ble/background
- Android Developers, Wear OS Data Layer overview: https://developer.android.com/training/wearables/data/overview
- Android Developers, Wear OS Data Layer synchronization: https://developer.android.com/training/wearables/data/sync

**Decision status:** Proposed. Initial development and verification remain pending.
