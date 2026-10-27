# Event Source Research

**Project:** Clockit Real-time Event-to-Transaction Streaming Infrastructure
**Research date:** 27 October 2026
**Status:** Research findings recorded; publication mechanism decision pending
**Scope:** Event identity, reliable event creation, publication, and recovery

## 1. Purpose

This document records the external technical evidence informing the event-source design.

The goal is to identify established ways to create and publish time-sensitive business events without losing the relationship between a business-state change and the event describing that change.

The research distinguishes documented technical behavior from proposed design decisions for this assessment.

## 2. Sources Reviewed

### 2.1 CloudEvents specification

**Source:** Cloud Native Computing Foundation, CloudEvents specification
**URL:** https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md

**Documented findings**

- `specversion` identifies the version of the CloudEvents specification.
- `id` identifies a distinct event occurrence within its source.
- `source` identifies the context in which the event occurred.
- The combination of `source` and `id` must uniquely identify each distinct event.
- A producer may resend an event with the same ID after a failure, allowing consumers to recognize duplicate events.
- `time` records when the occurrence happened, but CloudEvents makes this field optional.

**Implications for this assessment**

The proposed event contract should include a stable event identity, an identifiable source, a documented event type, and an occurrence timestamp.

Although CloudEvents does not require `time`, this design requires it because delayed delivery and replay must be distinguishable from a recent business occurrence.

A stable event ID helps identify duplicate publications. It does not independently prevent duplicate processing or duplicate financial transactions.

### 2.2 AWS Prescriptive Guidance: Transactional outbox

**Source:** Amazon Web Services, Transactional outbox pattern
**URL:** https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html

**Documented findings**

AWS describes a failure that occurs when an application updates its database and publishes an event as separate operations.

- The database update can succeed while event publication fails.
- An event can be published even though the associated database operation fails or rolls back.
- Either situation can leave downstream systems with information inconsistent with the source's actual state.

AWS documents the transactional outbox as one way to address this problem. The application writes the business change and its corresponding outbox record in the same database transaction. A separate publisher, or an appropriate change-data-capture mechanism, then forwards the committed event.

AWS also identifies duplicate messages and event ordering as concerns that require explicit handling.

**Implications for this assessment**

Where a business-state change must be accompanied by an event, the source should not depend on two unrelated operations both succeeding.

A transactional outbox is the preferred candidate when the chosen persistence system supports the required transaction boundary.

Publication retries must preserve event identity. Downstream components must tolerate duplicate delivery, and event ordering must be defined wherever business correctness depends on it.

The outbox is not automatically required for every possible source. Its suitability depends on the source's persistence and consistency requirements.

### 2.3 Debezium: Outbox Event Router

**Source:** Debezium, Outbox Event Router documentation
**URL:** https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html

**Documented findings**

Debezium documents a change-data-capture implementation of the outbox pattern. A connector captures changes to an outbox table and transforms the captured records into event messages.

Its documented outbox structure includes fields for event identity, aggregate type, aggregate ID, event type, and payload. The configuration can use the aggregate ID as a message key, which matters when preserving order within a Kafka partition.

**Implications for this assessment**

Change data capture is a viable publication approach when the selected database, connector infrastructure, and operational requirements justify it.

It introduces additional infrastructure and configuration compared with a simple application-managed publisher. Its use should therefore follow an explicit architecture decision, rather than being assumed solely because it is a recognized pattern.

Debezium's documented implementation is evidence that the approach is supported; it is not evidence that this assessment requires Debezium or Kafka.

## 3. Engineering Findings

The sources support these conclusions:

1. **Event identity must survive retries.** Retrying publication must not create a new identity for the same business occurrence.
2. **Business changes and their events must remain consistent.** Where both must be committed together, use a shared transaction boundary or an equivalent mechanism supported by the persistence system.
3. **Publication can be repeated.** A publisher may fail after sending an event but before recording successful publication. Recovery must account for this possibility.
4. **Consumers need duplicate protection.** Event identity supports duplicate detection, but each consumer must define how it handles repeated events.
5. **Event ordering is a business requirement, not an automatic guarantee.** The design must define the required ordering scope and verify it where necessary.
6. **Occurrence time and delivery time are different.** The system must retain enough timing information to diagnose delay and decide whether a time-sensitive event remains relevant.
7. **The publication mechanism depends on the persistence and infrastructure choices.** A separate publisher and change data capture are both established approaches, but neither should be selected without evaluating the actual requirements.

## 4. Candidate Publication Approaches

| Criterion               | Application-managed outbox publisher                                          | Change data capture                                                                    |
| ----------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Publication mechanism   | An application process reads pending outbox records and publishes them.       | A connector captures database changes and forwards the relevant events.                |
| Transaction consistency | Business change and outbox record can be written in one database transaction. | The same outbox transaction can be used, with CDC forwarding committed records.        |
| Recovery                | The publisher must track and retry pending records.                           | Connector offsets, database-log retention, and recovery configuration must be managed. |
| Operational complexity  | Requires publisher lifecycle, retry, and backlog management.                  | Requires CDC connector infrastructure, monitoring, and database compatibility.         |
| Main design concern     | Safe retries, concurrent workers, and tracking publication progress.          | Connector recovery, captured-change semantics, and operational dependencies.           |

This comparison is qualitative. Actual performance, latency, operating cost, and recovery behavior must be verified against the selected implementation.

## 5. Recommended Publication Design

The event source should use a transactional outbox when a business-state change and its corresponding event must be persisted atomically.

The business change and event record are written in the same database transaction. A separate publisher reads committed outbox records and publishes them to the event-delivery infrastructure. If the business transaction rolls back, neither the business change nor its corresponding outbox record is committed.

This design prevents a successful business-state change from being silently separated from the durable record of the event that describes it.

The publisher must retry temporary publication failures, preserve event identity across retries, and recover pending records after interruption. Because publication may succeed before the publisher records that success, duplicate publication must be expected and handled safely by downstream consumers.

The outbox mechanism does not, by itself, guarantee end-to-end delivery or exactly-once transaction execution. Those guarantees depend on the behavior of downstream consumers and the transaction-execution path.

The publication implementation should remain independent of the event contract so that the event format can remain stable if the underlying publishing mechanism changes.

## 6. Publication Mechanism Trade-off

Two established approaches can publish committed outbox records.

| Consideration       | Application-managed publisher                                                           | Change data capture (CDC)                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Operation           | A separate application process reads pending outbox records and publishes them.         | A connector captures database changes and forwards corresponding events.                                                      |
| Recovery            | The publisher retries pending records and tracks publication progress.                  | The CDC connector resumes from its recorded position, subject to database-log retention and connector recovery configuration. |
| Infrastructure      | Requires a publisher, durable outbox records, and monitoring of retries and backlog.    | Requires a compatible database, CDC connector, and monitoring of connector health and lag.                                    |
| Operational control | Publication retries and progress tracking are implemented directly in the application.  | Change capture and forwarding are managed through connector configuration and its operational lifecycle.                      |
| Main risks          | Duplicate publication, concurrent-worker coordination, and incorrect progress tracking. | Connector interruption, database-log retention limits, configuration errors, and delayed event forwarding.                    |

For this implementation, an application-managed outbox publisher is the preferred starting point because its publication and recovery behavior can be implemented and tested directly without introducing a separate CDC platform.

This choice is an engineering trade-off, not a claim that an application-managed publisher is universally superior. CDC remains a valid alternative when existing infrastructure, event volume, or operational requirements justify it.

The selected implementation must be validated through failure-recovery tests and measurements of publication latency, retry behavior, and pending-event backlog.

## 7. Verification Requirements

The eventual implementation should demonstrate:

- A business operation and its event record either commit together or roll back together, where the outbox pattern applies.
- Pending events recover after temporary publication failure.
- Retries retain the original event ID.
- A publication followed by a publisher crash does not cause unsafe duplicate processing.
- Invalid event payloads are rejected or handled according to a documented policy.
- Required ordering is maintained within its defined scope.
- Expired events are not treated as automatically valid transaction instructions.
- Logs and metrics distinguish event creation, publication attempts, publication acceptance, downstream processing, and final transaction execution.

Each test should record its initial conditions, simulated failure, expected result, and observed evidence.

## 8. References

1. Cloud Native Computing Foundation. _CloudEvents Specification._ https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md
2. Amazon Web Services. _Transactional outbox pattern._ https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
3. Debezium. _Outbox Event Router._ https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html

These sources document established specifications and implementation patterns. They do not establish which database, broker, or publication infrastructure Clockit currently operates.
