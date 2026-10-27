# ADR-001: Event Publication Mechanism

**Status:** Accepted for the proposed architecture  
**Decision date:** 27 October 2026  
**Scope:** Reliable publication of backend business events

## 1. Context

Time-sensitive events must reach downstream components even when publication infrastructure is temporarily unavailable.

When a business-state change and its corresponding event must be persisted consistently, performing the database update and event publication as separate, independent operations creates a failure window. The business change may succeed while publication fails, or an event may be published for a business operation that subsequently rolls back.

The publication mechanism must support recovery from temporary failures, preserve event identity across retries, and allow downstream components to handle duplicate publications safely.

## 2. Decision

Use an application-managed publisher to publish pending records from a transactional outbox.

Where the business-state change and its corresponding event must be committed atomically, both records must be written within the same supported database transaction.

A separate publisher will read committed outbox records and publish them to the selected event-delivery infrastructure. It will track publication progress, retry recoverable failures, and resume pending work after interruption.

The event contract will remain independent of the publication mechanism. Each event will retain its identity across retries so downstream consumers can recognize repeated publications.

The database and event-delivery technology will be selected separately according to the implementation requirements. This decision does not prescribe a particular database, message broker, or cloud provider.

## 3. Alternatives Considered

### 3.1 Application-managed outbox publisher — selected

A dedicated application process reads pending outbox records and publishes them.

This approach provides direct control over retry behavior, publication progress, error handling, and recovery. Those behaviors can be tested through explicit failure scenarios without requiring a separate change-data-capture platform.

### 3.2 Change data capture (CDC) — not selected for the initial design

A CDC connector observes committed database changes and forwards corresponding outbox events.

This is an established alternative, but it introduces connector configuration, operational monitoring, database-log retention requirements, and additional recovery considerations. Those costs are not justified by the current design requirements.

CDC may be reconsidered if the chosen infrastructure or measured operational needs make it more appropriate.

### 3.3 Direct database update followed by event publication — rejected where atomic consistency is required

This approach performs the business-state change and event publication as separate operations without a durable intermediate record.

A failure between the operations can leave the business state changed without a corresponding published event. Retrying the entire business operation may also repeat side effects unless those operations are independently protected.

It does not provide the required consistency by itself.

## 4. Consequences

### Benefits

- Business-state changes and corresponding outbox records can be committed atomically when supported by the chosen persistence system.
- Pending events can be recovered after temporary publication failures.
- Retry behavior and publication progress are directly testable.
- The event contract remains independent of the underlying publishing technology.

### Costs and limitations

- The system must maintain outbox records and publication progress.
- The publisher requires retry policies, monitoring, and recovery behavior.
- Publication may occur more than once if a publisher crashes after sending an event but before recording success.
- Consumers must handle duplicate events safely.
- Event ordering must be explicitly defined where business correctness depends on it.
- The outbox does not guarantee end-to-end delivery or exactly-once transaction execution by itself.

## 5. Required Verification

The implementation must demonstrate the following behaviors:

1. The business-state change and outbox record commit or roll back together where atomic consistency is required.
2. A temporary publication failure leaves the event recoverable.
3. Restarting the publisher allows pending events to be published without changing their identities.
4. A crash after publication but before recording success may cause another publication, but does not cause unsafe duplicate processing downstream.
5. Invalid events and unrecoverable publication failures are observable and handled according to documented policies.
6. Publication latency, retry counts, pending-event backlog, and oldest-pending-event age can be measured.
7. Ordering is preserved and verified within the scope required by the business.

Verification must distinguish successful event creation, durable recording, publication acceptance, downstream processing, and final transaction execution.

## 6. Decision Boundaries

This decision establishes the publication pattern, not the entire event-streaming infrastructure.

The database, broker, event schema details, delivery guarantees, ordering scope, and operational thresholds must be defined and validated as part of the implementation design.

The transactional outbox guarantee depends on the business-state change and event record sharing a suitable transaction boundary. If the selected persistence architecture cannot provide that boundary, the design must be revised before claiming atomic consistency.

## 7. References

1. Amazon Web Services, _Transactional outbox pattern_: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
2. Cloud Native Computing Foundation, _CloudEvents Specification_: https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md
3. Debezium, _Outbox Event Router_: https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html
