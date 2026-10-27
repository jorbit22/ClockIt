# Backend Event Delivery Research

**Project:** Clockit — Real-Time Event-to-Transaction Streaming Infrastructure
**Stage:** 2 — Backend Event Delivery Service
**Status:** Research completed; architecture decisions remain subject to verification
**Date:** 27 October 2026

## 1. Purpose

This document examines the engineering patterns required to deliver a published backend event to its intended phone companion reliably.

The existing Event Source design covers event creation, the event contract, and reliable publication from the source. This research addresses the subsequent delivery responsibilities: receiving published events, resolving recipients, transmitting events to phones, tracking acknowledgments, and recovering from interrupted delivery.

The assessment requires time-sensitive delivery to a smartwatch through an Android phone companion. It also describes unreliable mobile connections, phone process death, delayed delivery, and a target of 500,000 concurrent users.

The assessment does not prescribe a particular message broker, cloud provider, database, or backend delivery framework. Technology choices must therefore be justified by the requirements and verified through testing.

## 2. Sources Reviewed

### 2.1 WebSocket protocol — IETF RFC 6455

Source: https://www.rfc-editor.org/rfc/rfc6455

WebSocket provides two-way communication between a client and a server over a connection established through an opening handshake and message framing over TCP.

**Engineering finding:** WebSocket is a suitable candidate for the live phone-to-backend communication path. It supports server-initiated event delivery and phone-initiated messages over the same connection.

**Limitation:** The protocol itself does not establish durable event storage, recipient routing, application-level acknowledgment, offline replay, or successful processing by the phone. Those responsibilities require additional application and backend behavior.

### 2.2 Google Cloud Pub/Sub — Subscription overview

Source: https://docs.cloud.google.com/pubsub/docs/subscription-overview

Pub/Sub separates publication from consumption through topics and subscriptions. Subscribers acknowledge messages they have received and processed. Unacknowledged messages can be delivered again after the acknowledgment deadline. Default delivery is at least once, and duplicates can occur.

**Engineering finding:** A durable asynchronous handoff can separate event publication from downstream delivery workers. Acknowledgment and retry behavior must be defined explicitly.

**Limitation:** A message broker's consumer acknowledgment concerns consumption by that consumer. It does not automatically prove that a mobile phone received or displayed the event.

### 2.3 Google Cloud Pub/Sub — Subscriber best practices

Source: https://docs.cloud.google.com/pubsub/docs/subscribe-best-practices

The documentation recommends processing a message before acknowledging it, preserving message identifiers for troubleshooting, and using flow control to avoid overloading subscribers during traffic spikes.

**Engineering finding:** Delivery workers should not acknowledge an upstream message before the work required to preserve it for downstream delivery has safely completed. Stable event identifiers and controlled worker concurrency support recovery and diagnosis.

### 2.4 Amazon SQS — Visibility timeout

Source: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html

SQS makes a received message temporarily invisible to other consumers. If the message is not deleted before the visibility timeout expires, it becomes available for another attempt. The service uses an at-least-once delivery model, so duplicate processing remains possible.

**Engineering finding:** Durable queues can support recovery after worker interruption, but retries can produce duplicate processing. Consumers must be designed accordingly.

**Limitation:** Queue visibility and deletion govern queue consumption. They are not substitutes for application-level device-delivery acknowledgments.

### 2.5 Firebase Cloud Messaging — Android message priority

Source: https://firebase.google.com/docs/cloud-messaging/android-message-priority

FCM high-priority messages attempt prompt delivery and can wake a sleeping device for limited processing. The message handler has only a short processing window. Additional work may require an appropriate Android background-work mechanism. FCM also supports message lifetimes, and acceptance of a message by FCM does not mean that it has already reached the device.

**Engineering finding:** FCM is a candidate for time-sensitive notification or wake-up behavior when persistent connectivity is unavailable. The phone must handle the payload within platform limits and use an appropriate mechanism for additional work.

**Limitation:** FCM acceptance does not prove that the phone processed the event, relayed it to the watch, or displayed it. FCM must not be treated as proof of end-to-end delivery.

## 3. Delivery Responsibilities

The backend delivery path has the following logical responsibilities. These are responsibilities to implement or assign, not a requirement to deploy a separate microservice for each one.

### 3.1 Receive the published event

The delivery system receives the event from the publication mechanism selected at the source boundary.

It validates the event envelope, preserves the stable event identifier, and rejects or isolates invalid messages according to a defined policy.

The source publication acknowledgment and the delivery system's internal processing acknowledgment must have distinct meanings.

### 3.2 Resolve intended recipients

The delivery system determines which authenticated user or registered device is eligible to receive the event.

Recipient resolution must be based on explicit application rules, device registration, and authorization. It must not assume that every event targets every connected phone.

The design must define behavior for users with multiple registered devices, revoked devices, missing recipient information, and events that no longer apply to the recipient.

### 3.3 Deliver to a connected phone

The live-delivery component identifies the authenticated phone session and attempts to transmit the event over the selected connection.

A successful socket write indicates that the server's transport accepted the write operation. It does not establish that the remote application received or processed the complete event.

### 3.4 Preserve work for disconnected phones

When a phone is unavailable, the delivery system needs a defined policy for retaining or recovering pending events.

The system must account for the event's expiry, priority, and whether it remains useful when connectivity returns. A time-critical event that is no longer valid must not be replayed blindly.

### 3.5 Track acknowledgments and retries

The system must distinguish an attempted transmission from an acknowledgment received at the application level.

If acknowledgment is absent, the delivery system must determine whether to retry, wait for reconnection, expire the event, or move it to an operational failure path.

Because an acknowledgment can be lost after the phone has already received an event, duplicate delivery must be expected and handled safely.

## 4. Candidate Architecture Approaches

### 4.1 Direct synchronous publication to the delivery gateway

In this approach, the source calls the delivery service directly, which attempts to send the event to the relevant phone.

**Advantages**

- A relatively short path for live delivery.
- Fewer infrastructure components.
- Straightforward to demonstrate in a small prototype.

**Disadvantages**

- A slow or unavailable delivery service can affect the source's publishing path.
- Offline recipients require another durable storage and recovery mechanism.
- Handling partial failure across source publication and device transmission becomes more complicated.

**Assessment:** Suitable for a limited prototype, but insufficient as the only reliability mechanism for the complete assessment.

### 4.2 Durable broker or queue between publication and delivery workers

In this approach, the publisher hands events to a durable messaging system. Delivery workers consume those events, resolve recipients, and arrange downstream delivery.

**Advantages**

- Separates event publication from downstream processing.
- Supports retries after worker interruption.
- Allows consumer capacity to be scaled separately.
- Provides a place to control backlog and processing rates.

**Disadvantages**

- Adds infrastructure and operational responsibility.
- At-least-once delivery can produce duplicates.
- Acknowledging a message too early can lose downstream work; acknowledging it too late can cause unnecessary redelivery.
- A broker alone does not maintain the complete delivery history for each phone.

**Assessment:** A strong candidate for the backend handoff, provided that downstream delivery state is persisted before the upstream message is acknowledged.

### 4.3 Database-backed pending-delivery records

In this approach, the application stores a durable delivery record for each intended recipient. Workers retrieve pending records and attempt delivery.

**Advantages**

- Pending deliveries and their statuses can be inspected directly.
- Event expiry, per-recipient acknowledgment, and replay policies can be represented explicitly.
- It can reduce the number of infrastructure systems needed for a small implementation.

**Disadvantages**

- Workers need safe coordination when multiple instances process the same records.
- Polling, locking, indexing, cleanup, and backlog management require careful design.
- A single database can become a bottleneck if event fan-out and concurrent updates grow substantially.

**Assessment:** A viable alternative for an initial implementation if workload measurements and database capacity support it. Its scaling behavior must be tested rather than assumed.

### 4.4 WebSocket-only delivery without durable pending state

In this approach, the backend sends events only to currently connected phones.

**Advantages**

- Simple live-delivery path.
- Low additional infrastructure complexity.

**Disadvantages**

- Offline phones have no reliable recovery path unless events are stored elsewhere.
- A connection can fail during transmission without the server knowing whether the phone processed the event.
- Reconnection alone cannot recover events that were never retained.

**Assessment:** Not sufficient as the complete delivery design for the assessment's failure scenarios.

### 4.5 Push-based delivery through FCM

In this approach, the backend sends an FCM message to the registered phone when an event needs attention.

**Advantages**

- Provides a platform-managed delivery path that can work without the application's own persistent WebSocket being active.
- High-priority messages can support time-sensitive, user-visible notifications.

**Disadvantages**

- Delivery timing and background processing remain subject to platform behavior.
- Message acceptance is not proof of device receipt or application processing.
- Push payloads and handler work must respect platform constraints.
- Push delivery does not itself implement the phone-to-watch relay or complete recovery protocol.

**Assessment:** A useful complementary path to evaluate, not a replacement for explicit event identity, validity, processing, and acknowledgment rules.

## 5. Recommended Direction for the Proposed Design

Use the following as the initial design direction for further validation:

1. Keep the existing Event Source and its transactional-outbox publication boundary.
2. Introduce a durable handoff to backend delivery workers, using a broker or a database-backed queue selected according to implementation complexity and measured needs.
3. Resolve eligible recipients explicitly and preserve the stable event identifier throughout processing.
4. Maintain per-recipient delivery state where needed, including pending status, attempts, last attempt time, acknowledgment status, and event expiry.
5. Use an authenticated live connection for prompt delivery to connected phones.
6. Require a defined application-level phone acknowledgment rather than treating a successful socket write as proof of receipt.
7. Preserve pending delivery state so that reconnection can recover still-valid events.
8. Evaluate FCM as a complementary notification or wake-up path for cases where persistent connectivity is unavailable.
9. Ensure that duplicate event delivery does not cause duplicate user-visible actions or duplicate transaction execution.

This direction does not require each responsibility to be a separate service. The first implementation should use the smallest structure that can demonstrate the required behavior and can be tested for failure recovery.

The precise broker, storage technology, and live-connection implementation remain open decisions until the project constraints and test requirements are evaluated.

## 6. Acknowledgment Contract

The implementation must distinguish these milestones:

| Milestone                                 | Meaning                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| Source publication accepted               | The publication mechanism accepted the event according to its contract.                       |
| Delivery worker persisted downstream work | The delivery system has safely retained the work needed to continue delivery.                 |
| Server transmission attempted             | The backend attempted to write the event to the phone connection.                             |
| Phone receipt acknowledged                | The phone confirmed the explicitly defined receipt condition.                                 |
| Watch relay acknowledged                  | The phone or watch confirmed the corresponding relay condition, if supported by the protocol. |
| Watch presentation confirmed              | The watch confirmed presentation, if the implementation supports this evidence.               |

A delivery acknowledgment must specify what the receiving application has actually done. For example, the protocol may define phone receipt as successful validation and durable local storage of the event. If so, the phone must not send that acknowledgment before those steps complete.

A phone receipt acknowledgment does not prove that the watch displayed the event. Watch presentation requires a separate signal if the system needs that guarantee.

## 7. Recovery and Validity Requirements

The delivery design should define:

- A stable event identifier used across publication, retries, phone delivery, and diagnostic logs.
- Event creation time, expiry time or validity policy, and delivery priority.
- A maximum retention period for pending delivery work.
- Retry behavior for unavailable phones and failed connection writes.
- Duplicate handling at each processing boundary.
- A replay policy after reconnection.
- A policy for expired events that must no longer be presented as current.
- Monitoring for delivery backlog, retry counts, expired events, and acknowledgment latency.
- Authentication and authorization for phone sessions and delivery acknowledgments.

Transaction intents require their own idempotency and outcome-recovery contract. Successful delivery of an event is not authorization to execute a transaction, and acknowledgment of a transaction request is not proof that the transaction completed.

## 8. Verification Plan

The proposed delivery design should be tested against these scenarios:

| Scenario                                                                          | Expected evidence                                                                     |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Delivery worker stops after receiving a message                                   | The event remains recoverable without being silently lost.                            |
| Worker persists downstream work but fails before acknowledging the source message | Redelivery does not create duplicate logical delivery records.                        |
| Phone is offline when the event is published                                      | The event remains pending or follows the documented expiry policy.                    |
| Server writes to the socket but the phone does not acknowledge                    | The system does not report confirmed phone receipt.                                   |
| Phone receives an event but its acknowledgment is lost                            | A retry is safe and does not create duplicate logical processing.                     |
| Phone reconnects after a prolonged outage                                         | Still-valid pending events can be recovered; expired events follow the expiry policy. |
| Many phones reconnect together                                                    | Delivery and retry load remain controlled, and backlog recovery can be measured.      |
| An FCM send request is accepted                                                   | The system does not treat that acceptance alone as proof of device receipt.           |

The test record must distinguish simulated behavior from physical-device or real-network testing. No test should be marked passed until it has actually been executed and its results recorded.

## 9. References

1. IETF, _RFC 6455: The WebSocket Protocol_. https://www.rfc-editor.org/rfc/rfc6455
2. Google Cloud, _Subscription overview_. https://docs.cloud.google.com/pubsub/docs/subscription-overview
3. Google Cloud, _Best practices to subscribe to a Pub/Sub topic_. https://docs.cloud.google.com/pubsub/docs/subscribe-best-practices
4. Amazon Web Services, _Amazon SQS visibility timeout_. https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html
5. Firebase, _Set and manage Android message priority_. https://firebase.google.com/docs/cloud-messaging/android-message-priority
6. Firebase, _Set the lifespan of a message_. https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan
7. AWS Prescriptive Guidance, _Transactional outbox pattern_. https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
