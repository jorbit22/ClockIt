# ADR-002: Backend Event Delivery Architecture

**Project:** Clockit — Real-Time Event-to-Transaction Streaming Infrastructure
**Stage:** 2 — Backend Event Delivery Service
**Status:** Proposed
**Date:** 27 October 2026

## 1. Context

The Event Source and publication design establishes how backend events are created, identified, and published. The backend delivery service must take responsibility for delivering those events to their intended phone devices and recovering from interrupted delivery.

The assessment requires reliable event delivery despite worker failures, disconnected phones, lost acknowledgments, duplicate messages, delayed processing, and unreliable mobile connectivity. It also specifies a target of 500,000 concurrent users, whose capacity implications remain to be measured.

The research and design documents identify several possible approaches, including direct synchronous delivery, a durable message broker, a database-backed queue, WebSocket-only delivery, and FCM-based delivery.

The architectural decision must distinguish durable backend processing from successful phone receipt. No transport write or broker acknowledgment alone establishes that the phone has durably stored an event.

## 2. Decision

Adopt the following proposed architectural direction for backend event delivery:

1. Preserve the existing Event Source and transactional-outbox publication boundary.
2. Use a durable asynchronous handoff to separate event publication from delivery-worker processing.
3. Prefer a durable message broker for work distribution, subject to confirmation that a suitable broker is available and appropriate for the implementation environment.
4. Maintain persistent per-device delivery records independently of broker acknowledgment state.
5. Use stable event and device identifiers, with an enforced uniqueness constraint on `(event_id, device_id)`.
6. Use an authenticated live connection for prompt delivery to connected phones.
7. Define phone receipt as an application-level acknowledgment sent only after the phone validates and durably stores the event.
8. Make delivery processing, acknowledgment handling, and retries safe under duplicate messages and interrupted operations.
9. Enforce event-validity rules so expired events are not transmitted again as current events.
10. Treat FCM as an optional complementary delivery or wake-up mechanism, not as proof of phone receipt.

This decision establishes the architectural direction. It does not select a specific broker, database, cloud provider, or connection-gateway product.

## 3. Rationale

A durable asynchronous handoff separates event publication from the availability and processing speed of delivery workers. Worker interruption should not silently remove accepted work.

A separate per-device delivery record provides the application-level state needed to track attempts, acknowledgments, expiry, retries, and recovery. A broker's acknowledgment state alone cannot represent whether a particular phone has durably stored an event.

Stable identifiers and atomic uniqueness enforcement make repeated publication and worker redelivery safe at the logical-delivery level.

An explicit phone acknowledgment contract prevents the system from confusing a successful socket write with confirmed application receipt.

The selected direction addresses the required recovery behavior without claiming exactly-once delivery or proven capacity at the assessment's concurrency target.

## 4. Alternatives considered

### 4.1 Direct synchronous publication to the delivery gateway

**Not selected as the sole reliability mechanism.**

Direct delivery can simplify a small demonstration and shorten the live-delivery path. However, it couples event publication to downstream delivery availability and does not, by itself, provide durable recovery for offline phones or interrupted delivery.

### 4.2 Durable broker with persistent per-device delivery records

**Preferred architectural direction.**

This separates work distribution from device-delivery state and allows delivery workers to be scaled independently. It introduces broker configuration and operational responsibilities, and it still requires idempotent processing, durable persistence, and explicit acknowledgment semantics.

The actual broker and its guarantees must be verified against the implementation environment.

### 4.3 Database-backed queue

**Retained as an alternative.**

A database-backed queue may be appropriate if the available environment does not justify a separate broker and measured capacity is sufficient. It requires safe work claiming, concurrent-worker coordination, retry recovery, and protection against database contention.

It must not be assumed inferior without evaluating the available infrastructure and workload.

### 4.4 WebSocket-only delivery without durable pending state

**Rejected as the complete reliability design.**

WebSocket provides a live communication channel but does not independently preserve pending events for offline phones or recover work that was never durably retained.

### 4.5 FCM-only delivery

**Rejected as the complete delivery design.**

FCM can provide a complementary platform-managed delivery path. Acceptance of a push request does not establish device receipt, application processing, watch presentation, or transaction execution.

## 5. Required processing and acknowledgment rules

### 5.1 Durable handoff

The delivery worker must not acknowledge the upstream broker message until the downstream work required to continue delivery has been durably recorded.

Repeated processing of the same published event must reuse existing logical delivery records. Where recipient fan-out is batched, unfinished batches must remain discoverable and recoverable after interruption.

### 5.2 Per-device delivery state

Each logical delivery is identified by `(event_id, device_id)`.

The implementation must enforce uniqueness atomically and preserve sufficient state to recover pending work, coordinate concurrent attempts, and investigate failures.

Worker leases and conditional state updates must prevent stale workers from overwriting newer results.

### 5.3 Phone receipt

The phone may send `PHONE_STORED` only after it has validated the event, verified its eligibility and validity, and committed it to durable local storage.

The backend must authenticate and authorize the acknowledgment and process repeated acknowledgments idempotently.

`PHONE_STORED` confirms phone storage under the protocol contract. It does not establish watch receipt, watch presentation, user interaction, or transaction completion.

### 5.4 Recovery and expiry

Missing acknowledgments must not be interpreted as successful receipt.

Retries, worker-lease recovery, event expiry, terminal failure handling, and late acknowledgment processing must follow explicit state-transition rules.

A valid late acknowledgment may correct delivery state when it proves the phone already stored the event. It must not authorize a new transmission of an expired event as current.

## 6. Consequences

### Positive consequences

- Event publication and delivery-worker availability are decoupled.
- Pending delivery work has an explicit recovery path.
- Delivery state can be inspected independently for each intended device.
- Duplicate publication and worker redelivery can be handled safely.
- Phone receipt is distinguished from transmission attempts and downstream watch behavior.
- Delivery latency, backlog, retry activity, expiry, and acknowledgment outcomes can be measured separately.

### Costs and limitations

- The design requires durable delivery-state storage and concurrency controls.
- A broker adds infrastructure and operational overhead.
- Recipient fan-out and large recovery backlogs require bounded processing and capacity testing.
- Delivery state, broker state, and phone-local state can temporarily disagree and must be reconciled through defined recovery behavior.
- The design does not establish physical-device reliability, real mobile-network behavior, or support for 500,000 concurrent users without appropriate verification.

## 7. Security and observability requirements

The implementation must authenticate phone sessions, authorize delivery against registered devices, validate acknowledgments, enforce device-revocation rules, protect transport, and apply appropriate data-retention and access controls.

Logs and metrics must distinguish publication acceptance, durable handoff, transmission attempts, and confirmed phone storage. Correlation identifiers should support diagnosis without exposing sensitive event payloads or credentials.

Operational thresholds, service-level objectives, and capacity claims remain subject to requirements, workload assumptions, and measured evidence.

## 8. Verification required

Before the architecture can be considered verified, tests must demonstrate:

- Recovery after worker interruption before and after downstream persistence.
- Duplicate-safe processing after broker redelivery.
- Atomic uniqueness of per-device delivery records.
- Safe concurrent updates and expired worker-lease recovery.
- Correct phone acknowledgment behavior, including lost and repeated acknowledgments.
- Recovery of valid pending events after phone reconnection.
- Prevention of new transmissions for expired events.
- Correct behavior when the broker or delivery-state store is unavailable.
- Observable backlog and controlled recovery under reconnect surges.
- Capacity measurements appropriate to the required workload.

Test records must identify the environment and distinguish simulated results from physical-device, carrier-network, and production evidence.

No test or capacity target is considered verified by this decision record.

## 9. Unresolved decisions

The following remain open:

1. The broker product and its configured durability, retention, acknowledgment, and retry guarantees.
2. The delivery-state database and its transaction, uniqueness, and concurrency capabilities.
3. The connection-gateway implementation and authentication mechanism.
4. The exact retry limits, backoff values, retention periods, and expiry policy.
5. The payload-storage strategy and recipient-fan-out batching mechanism.
6. Whether FCM is necessary for the initial implementation.
7. Workload assumptions and test criteria supporting the 500,000-concurrent-user target.

These choices must be resolved using implementation constraints, documented rationale, and verification where appropriate.

## 10. References

- IETF, [RFC 6455 — The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455)
- Google Cloud, [Subscription overview](https://docs.cloud.google.com/pubsub/docs/subscription-overview)
- Google Cloud, [Subscriber best practices](https://docs.cloud.google.com/pubsub/docs/subscribe-best-practices)
- AWS, [Amazon SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html)
- Firebase, [Android message priority](https://firebase.google.com/docs/cloud-messaging/android-message-priority)
- AWS Prescriptive Guidance, [Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)

This decision record is based on `docs/research/backend-event-delivery-research.md` and `docs/design/backend-event-delivery.md`. It records a proposed architectural direction, not implementation or verification evidence.
