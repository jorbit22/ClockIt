# Event Source Design

## 1. Purpose

The event source produces structured, time-critical business events for the Clockit event-to-transaction system.

The source is responsible for identifying a meaningful occurrence, validating the relevant business condition, and creating an event that downstream components can interpret.

The design separates event creation from event transport. The event source does not own phone connection maintenance, smartwatch communication, or transaction execution.

## 2. Requirements and Scope

The assessment requires backend event sources capable of producing time-critical events. It gives "Flash sale – 12 units left" and "Stop-loss triggered" as illustrative examples.

The assessment does not identify a specific Clockit business service, database, event schema, or publishing technology.

Accordingly, this design defines a logical event-source responsibility and event contract without assuming an undocumented internal Clockit architecture.

## 3. Event Creation

An event is created when the responsible business component detects a defined occurrence or condition.

The source must:

- Evaluate the relevant business condition using appropriate authoritative state.
- Avoid publishing an event for a business operation that failed or was rolled back.
- Assign a stable identity to each distinct event.
- Record the occurrence time for time-critical events.
- Include the event type and the business information required for downstream interpretation.
- Apply a documented event schema and validation rules.
- Preserve events reliably when the business-state change and event creation must succeed together.

The business condition that triggers each event must be defined by the relevant business domain. The illustrative assessment examples do not establish Clockit's actual business rules.

## 4. Event Contract

The proposed event envelope follows the CloudEvents specification. The event contract defines the identity, type, occurrence time, and business data required by downstream components.

| Field              | Requirement                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `specversion`      | Identifies the CloudEvents specification version.                                                                                       |
| `id`               | Identifies one distinct event occurrence within its source.                                                                             |
| `source`           | Identifies the context in which the event occurred.                                                                                     |
| `type`             | Identifies the kind of business occurrence using a documented event name.                                                               |
| `time`             | Records the occurrence time. CloudEvents makes this field optional, but this design requires it for time-critical events.               |
| `subject`          | Identifies the affected business entity when applicable.                                                                                |
| `data`             | Contains the event-specific business information required for interpretation.                                                           |
| Expiry information | Defines when an event is no longer actionable. Its representation is application-specific and must be documented in the event contract. |

The combination of `source` and `id` identifies a distinct event. A retry of the same event must retain its original identity. A genuinely new business occurrence must receive a distinct identity, even if its type and affected entity match an earlier event.

The event contract must document required fields, data types, validation rules, and compatibility expectations. Incompatible changes must be managed explicitly rather than silently changing the meaning of existing fields.

The event identity supports duplicate detection; it does not, by itself, guarantee that downstream processing or transaction execution happens only once.

## 5. Source-Side Publication Reliability

When a business-state change and the event describing that change must remain consistent, writing to the business database and publishing an event as separate operations creates a failure window.

For this case, the preferred design is a transactional outbox or an equivalently reliable mechanism supported by the source's persistence and consistency requirements.

With a transactional outbox, the business-state change and the corresponding event record are committed in the same database transaction. If the transaction fails or rolls back, neither change is committed. A separate publisher reads committed outbox records and attempts to publish them.

The publisher must recover pending records after interruptions and make publication failures observable. It must not permanently lose an event merely because the publishing system was temporarily unavailable.

Publication and recording successful publication are separate operations. If a publisher sends an event successfully but crashes before recording that success, it may publish the event again after restarting. Therefore:

- Retries must preserve the original event identity.
- The publisher must retain enough state to recover pending work.
- Downstream consumers must handle duplicate events safely.
- The system must not assume that a successful publication attempt proves that every downstream component processed the event.

Where event order matters to the business, the design must define how ordering is preserved and verified.

The transactional outbox is conditional on the source's persistence and consistency requirements. It is not mandatory for every possible event source. Change data capture is an alternative where the database and event semantics make it appropriate.

## 6. Event Validity and Time

The source must distinguish the time of the business occurrence from the time the event is published, delivered, or processed. These times serve different diagnostic and operational purposes.

Time-critical events must carry enough information to determine whether they remain relevant when processed.

Where an event can become stale, the event contract must define its expiry rule and representation. The system must specify what happens when an expired event is received, recovered from a backlog, or replayed after a connection interruption.

An expired event must not automatically authorize a transaction. Before executing a transaction, the responsible backend component must apply the relevant current-state checks, authorization rules, and transaction-specific validity conditions.

The event payload must contain sufficient business context for interpretation without unnecessarily duplicating sensitive information or treating a notification as proof that the underlying business state remains unchanged.

## 7. Failure Handling

The source design must account for the following cases:

- The business operation fails before committing.
- The business operation commits but event publication is temporarily unavailable.
- The publishing process retries the same event.
- An event is published more than once.
- The source produces invalid or incomplete event data.
- An event arrives after its useful action period.
- A schema change makes an event incompatible with a consumer.

The selected persistence and publication mechanism must prevent false events for failed business operations and provide a recoverable path for events awaiting publication.

Monitoring must make persistent publication failures and growing publication delays observable.

## 8. Verification

The source implementation must be tested for:

1. Correct event creation when a defined business condition occurs.
2. No event creation for a business operation that fails or rolls back, where event creation is tied to that operation.
3. Recovery of pending event records after temporary publication failure, where durable publication is required.
4. Stable event identity across retries of the same event.
5. Distinct identities for separate business occurrences, including repeated occurrences affecting the same entity.
6. Validation of required fields and event-specific payloads.
7. Correct recording of occurrence time and handling of expired events.
8. Compatibility with the documented event schema.
9. Recovery when a publisher crashes before publishing, during publication, or after publication but before recording success.
10. Safe downstream handling of duplicate publication.

Each test must define the initial conditions, action, expected result, and observed evidence.

For example, a publication-recovery test should make an event pending, simulate publication failure, restart the publisher, and verify that the event is eventually published with its original identity. A separate test should simulate a successful publication followed by a crash before success is recorded, then verify that any repeated publication is handled safely downstream.

Tests must distinguish successful event creation, durable recording, publication acceptance, downstream processing, and final transaction execution. Passing one stage must not be treated as proof that later stages succeeded.

## 9. References

- CloudEvents specification: https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md
- CloudEvents Primer: https://github.com/cloudevents/spec/blob/main/cloudevents/primer.md
- AWS Prescriptive Guidance, Transactional Outbox Pattern: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html

These references establish event-envelope conventions and a documented approach to reliable publication. They do not establish Clockit's existing internal implementation.

## 10. Design Boundary

This design defines the responsibility and contract of the event source. The specific business service, database, event-publishing infrastructure, and business-specific payload schemas must be selected according to the implementation's actual requirements.

The event-source contract must be established before the downstream delivery stages depend on it.
