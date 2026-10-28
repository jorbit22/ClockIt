# Integrated Event-to-Transaction Architecture Research

**Status:** Research completed; integrated design and verification pending
**Date:** 28 October 2026
**Scope:** Integration of the six documented system components
**Implementation status:** No integrated implementation verified
**Verification status:** No end-to-end test results established

## 1. Purpose

This research examines how the six existing components must work together to support the complete event-to-transaction lifecycle.

The system must be able to:

1. Create and publish a meaningful backend event.
2. Deliver the event to the intended phone.
3. Recover delivery when the phone or network becomes unavailable.
4. Relay the event from the phone to the watch.
5. Recognize a user interaction and create a transaction intent.
6. Submit the intent to the backend and process the requested operation.
7. Preserve and communicate the authoritative transaction outcome.
8. Recover safely when messages, acknowledgments, processes, or connections fail.

The research focuses on the contracts between components, not merely the internal behavior of individual components.

The six component designs already describe many individual responsibilities. The remaining research question is whether their combined behavior is sufficiently explicit to support a coherent end-to-end architecture.

## 2. Research scope and evidence classification

This document uses four evidence categories.

| Category                              | Meaning                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Established source fact               | Behavior documented by an authoritative technical specification or platform reference                                        |
| Existing project decision or proposal | Behavior already described in a component research document, design, or ADR                                                  |
| Integration finding                   | A consequence of combining established source facts and existing component contracts                                         |
| Unresolved question                   | A decision that cannot be established from the available evidence and must be resolved before implementation or verification |

A proposed design is not proof that the behavior exists in a working system.

No production deployment, physical watch test, carrier test, integrated test result, or 500,000-device capacity measurement has been established by this research.

## 3. Existing component research and design artifacts

The integrated architecture depends on these existing documents:

| Component                             | Research                                                   | Design                                          | Decision record                                            |
| ------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| Backend event source and publication  | `docs/research/event-source-research.md`                   | `docs/design/event-source.md`                   | `docs/decisions/ADR-001-event-publication.md`              |
| Backend event delivery                | `docs/research/backend-event-delivery-research.md`         | `docs/design/backend-event-delivery.md`         | `docs/decisions/ADR-002-backend-event-delivery.md`         |
| Adaptive phone connection manager     | `docs/research/connection-manager-research.md`             | `docs/design/adaptive-connection-manager.md`    | `docs/decisions/ADR-003-adaptive-connection-manager.md`    |
| Phone-to-watch relay                  | `docs/research/phone-to-watch-relay-research.md`           | `docs/design/phone-to-watch-relay.md`           | `docs/decisions/ADR-004-phone-to-watch-relay.md`           |
| Watch interaction and intent creation | `docs/research/watch-interaction-research.md`              | `docs/design/watch-interaction.md`              | `docs/decisions/ADR-005-watch-interaction.md`              |
| Backend transaction processing        | `docs/research/backend-transaction-processing-research.md` | `docs/design/backend-transaction-processing.md` | `docs/decisions/ADR-006-backend-transaction-processing.md` |

These documents establish the proposed component responsibilities and identify unresolved decisions. Their existence does not establish that their designs have been implemented or verified.

## 4. Research question: what does an event represent?

The CloudEvents specification describes an event as a record expressing an occurrence and its context. Its required `source` and `id` attributes identify a distinct event occurrence. A retransmitted event may retain the same identity.

Source: CloudEvents specification
https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md

### Research finding

The event represents something that happened in the backend business system. It is not itself a transaction command, proof that a user saw a notification, or proof that a transaction occurred.

The event source and event-delivery service have different responsibilities:

- The source identifies the business occurrence and creates the event.
- The publication mechanism transfers the event into the delivery infrastructure.
- The delivery service routes the event to the intended device.
- The phone and watch receive and process the event under their own application contracts.

A publication acknowledgment cannot be used as evidence that the phone or watch received the event.

### Integration implication

The event identity must remain available throughout delivery and recovery so that a retry does not accidentally become a new business occurrence.

The integrated design must also distinguish event identity from transaction-intent identity. A user may interact with an event to initiate a transaction, but the event and resulting transaction intent represent different things.

### Unresolved questions

- Which event types are actually required by the assessment implementation?
- What event data must be presented on the watch?
- What is the event-expiry policy?
- Which current business-state and authorization checks are required before a transaction can be initiated?

These questions cannot be answered by CloudEvents alone. They depend on the application and assessment requirements.

## 5. Research question: what does successful event delivery mean?

The existing backend event-delivery design proposes durable per-device delivery records and a `PHONE_STORED` acknowledgment.

Under that proposal, the phone sends `PHONE_STORED` only after it validates the event and commits it to a durable local inbox.

### Research finding

Different acknowledgments establish different facts.

| Evidence                                 | What it establishes                                                        | What it does not establish                         |
| ---------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| Event committed to the source outbox     | The event record was durably recorded under the selected database contract | The event reached a phone                          |
| Publication accepted                     | The publication infrastructure accepted the event under its contract       | The phone received it                              |
| Delivery attempt started                 | The service attempted transmission                                         | The phone received or stored it                    |
| Phone sent `PHONE_STORED`                | The phone claims it completed the defined validation and storage steps     | The watch received or displayed the event          |
| Watch stored the event                   | The watch completed its defined application-level storage operation        | The user saw the event or authorized a transaction |
| Backend accepted an intent               | The backend accepted the request under its contract                        | The requested operation succeeded                  |
| Authoritative execution outcome recorded | The backend has recorded the outcome supported by its execution evidence   | The watch has received that outcome                |

This distinction is an integration requirement: every acknowledgment must have a defined meaning, and downstream components must not infer stronger evidence than the acknowledgment provides.

### Source evidence

The CloudEvents specification defines event identity and event context, but it does not prescribe this application's phone-storage acknowledgment protocol.

Source: https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md

The application-specific `PHONE_STORED` contract comes from the existing project design, not from CloudEvents.

### Unresolved questions

- How are acknowledgment messages authenticated?
- What happens when an acknowledgment arrives after the corresponding delivery record has expired?
- What is the retention policy for acknowledged events?
- Which acknowledgment is required before the backend stops retrying each type of message?

These must be resolved in the relevant component contracts and verified by tests.

## 6. Research question: how should the phone and watch exchange data?

The existing relay design proposes a versioned application-message envelope containing a message identity and the applicable event or intent identity.

The proposed physical transport is BLE GATT, subject to verification against the target watch.

### Research finding: BLE connection and application delivery are different layers

Android's BLE documentation describes connections, service discovery, characteristics, and data transfer. These transport operations do not automatically establish that the receiving application has validated and durably stored a complete application message.

Source: Android Developers, Bluetooth Low Energy overview
https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview

Source: Android Developers, Transfer BLE data
https://developer.android.com/develop/connectivity/bluetooth/ble/transfer-ble-data

The relay therefore needs an application-level message and acknowledgment contract independent of the underlying transport operation.

### Research finding: Wear OS Data Layer is a platform-specific alternative

Android provides Wear OS Data Layer APIs with different delivery properties.

The official client comparison states that:

- `DataClient` supports persistent data-item synchronization.
- `MessageClient` sends messages to connected nodes and does not provide persistence or automatic retry.
- A successful `MessageClient` operation means the message was queued for delivery to the specified connected node, not that the application durably processed it.

Sources:

- https://developer.android.com/training/wearables/data/client-types
- https://developers.google.com/android/reference/com/google/android/gms/wearable/MessageClient
- https://developers.google.com/android/reference/com/google/android/gms/wearable/DataClient

The Wear OS documentation also explains that applications needing their own local copy should use application storage, such as a Room database, rather than treating the Data Layer as their database.

Source: https://developer.android.com/training/wearables/data-layer

These APIs are relevant only if the target watch supports the required Wear OS environment. They cannot be assumed to apply to every smartwatch.

### Integration implication

The phone-to-watch relay must define:

1. Which component owns each pending message.
2. Which identity is preserved across retries.
3. What the receiver validates.
4. When the receiver may acknowledge storage.
5. How the sender handles duplicate or delayed acknowledgments.
6. How interrupted delivery resumes after reconnection.

### Unresolved questions

- Is the assessment implementation using simulated BLE, real BLE GATT, Wear OS Data Layer, or another transport?
- What is the target watch platform?
- What message size, ordering, and expiry requirements apply?
- What authentication and device-association checks protect application messages?
- Does the assessment require physical-device verification or permit a documented simulation?

The target platform and assessment evidence requirements must be established before choosing the final transport implementation.

## 7. Research question: what can Android connection recovery guarantee?

The existing connection-manager design proposes adaptive timeout estimation, heartbeat scheduling, bounded reconnection backoff, stable message identities, pending-work recovery, and separate BLE liveness monitoring.

### Research finding: mobile connectivity is not equivalent to application availability

Android documents that Doze can suspend network access and defer jobs, synchronization, and standard alarms while the device is idle.

Source: Android Developers, Optimize for Doze and App Standby
https://developer.android.com/training/monitoring-device-state/doze-standby

This means that an application cannot safely assume that a timer or heartbeat will execute at its requested instant under all Android power conditions.

A foreground service also does not establish that every OEM will preserve the application process indefinitely. The target devices and Android versions require testing.

### Integration implication

The connection manager must distinguish:

- A known transport disconnection.
- A suspected silent failure.
- An application or operating-system scheduling delay.
- A network that exists but cannot currently reach the backend.
- A backend connection that has recovered.
- A BLE connection between the phone and watch.

These states must not be collapsed into a single generic "connected" flag.

A successful backend heartbeat does not prove BLE availability. A connected BLE link does not prove backend reachability.

The integrated system must preserve pending work across the failures covered by its actual storage guarantees. It must not claim process-restart recovery if pending work exists only in memory.

### Unresolved questions

- Which timeout-estimator parameters and fallback heartbeat interval will be selected?
- Which transport will the initial TypeScript implementation use?
- Which storage mode will be implemented for pending items?
- How will network changes affect retry scheduling?
- What can the simulated foreground-service adapter actually demonstrate?
- Which Android versions and OEM devices will be used for physical verification?

The current component design records these as unresolved or unverified decisions.

## 8. Research question: how should a transaction intent survive retries?

The existing watch-interaction and backend-transaction designs define a stable logical intent identity and distinguish intent creation from execution.

AWS's Builders' Library explains that idempotent APIs allow clients to retry requests safely when operations may have succeeded even though the response was lost. The request identity must be handled by the service, not merely by the caller.

Source: AWS Builders' Library, Making retries safe with idempotent APIs
https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/

### Research finding

A network timeout does not prove that a transaction failed.

For example:

1. The watch creates intent `I-123`.
2. The phone sends `I-123` to the backend.
3. The backend records the intent and begins execution.
4. The backend's response is lost.
5. The phone reconnects and retries `I-123`.

The backend must recognize the same logical intent. It must not create a new transaction simply because the original response was not received.

The stable intent identity must survive retries and recovery.

### Important limitation

Backend request idempotency alone does not guarantee that an external financial provider executes an operation only once.

A backend worker may submit an operation, lose the response, and be unable to determine whether the provider completed it. A local lease or claim can coordinate workers, but it cannot by itself prevent an old worker from resuming or prove the external provider's execution state.

The existing backend-transaction design therefore requires executor idempotency where supported, authoritative status lookup, reconciliation, or preservation of an uncertain state.

### Integration implication

The integrated architecture must distinguish at least these milestones:

- Intent created on the watch.
- Intent received by the backend.
- Intent accepted or rejected.
- Execution submitted.
- Execution outcome established.
- Outcome durably recorded.
- Outcome communicated to the watch.

The UI must not present an earlier milestone as proof of a later one.

### Unresolved questions

- What operation is being executed in the assessment implementation?
- What is the exact intent request and response schema?
- What authorization rules apply to the device and operation?
- Will execution use a deterministic simulator or an external provider?
- Which idempotency and reconciliation guarantees does the executor provide?
- What is the retention period for intent identities and outcomes?

## 9. Research question: how should the system recover a missing outcome?

The existing backend transaction design separates outcome persistence, retrieval, and delivery.

### Research finding

Execution and outcome communication are separate operations.

A backend may successfully complete a transaction and persist the result while the phone is disconnected. The phone may then be unable to relay the result to the watch.

If the system treats the missing response as a failed transaction, it may mislead the user or trigger an unsafe retry.

### Integration implication

The backend must preserve the authoritative outcome under its chosen durability contract. The outcome must be associated with the existing intent identity.

When communication returns, the system must be able to deliver the saved outcome or retrieve the current state of the existing intent.

If the backend cannot establish the execution result, the system must preserve uncertainty and use the defined reconciliation process. It must not invent success or failure based only on elapsed time.

### Unresolved questions

- Will outcome delivery use the existing phone connection, a separate channel, or polling/retrieval?
- What acknowledgment confirms that the watch received the outcome?
- How are delayed and duplicate outcome messages handled?
- How long are outcomes retained?
- How will a contradictory late provider response be reconciled?

## 10. Integrated handoff inventory

The following table consolidates the contracts that must be defined across the six components.

| Handoff | Sender                   | Receiver                                              | Required evidence or contract                                                              | Main unresolved area                                         |
| ------- | ------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 1       | Event source             | Publication infrastructure                            | Stable event identity and committed event record                                           | Actual broker, outbox storage, and publication configuration |
| 2       | Backend delivery service | Phone                                                 | Valid event envelope, recipient identity, expiry and `PHONE_STORED` semantics              | Exact transport and acknowledgment authentication            |
| 3       | Phone event inbox        | Phone-to-watch relay                                  | Stored event identity and explicit ownership transfer or shared-storage contract           | Pending-item ownership and retry responsibility              |
| 4       | Phone relay              | Watch                                                 | Versioned message, stable IDs, validation and durable application acknowledgment           | Target platform, transport, and wire schema                  |
| 5       | Watch interaction        | Backend intent-processing boundary, through the phone | Stable intent identity, requester/device identity, operation, parameters, protocol version | Exact API, authorization, and forwarding contract            |
| 6       | Backend intent processor | Execution adapter                                     | Eligible intent, execution-attempt identity, and defined execution contract                | Simulator/provider behavior and idempotency                  |
| 7       | Execution adapter        | Backend outcome persistence                           | Authoritative evidence or explicit uncertainty                                             | Provider status and reconciliation                           |
| 8       | Backend outcome service  | Watch, through the selected delivery path             | Existing intent identity, state, outcome and retrieval semantics                           | Delivery channel, retry policy, and acknowledgment           |

The table describes required boundaries, not proof that the contracts are already implemented.

## 11. Cross-component failure scenarios

The integrated design must account for failures that cross component boundaries.

| Scenario                                                | Evidence that may be missing                       | Required recovery question                                                                                    |
| ------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Backend publishes but delivery worker stops             | Delivery record or downstream handoff confirmation | Can the publication or pending-work mechanism resume without losing the event?                                |
| Phone stores an event but its acknowledgment is lost    | Backend's knowledge of phone receipt               | Can the same event be safely redelivered and acknowledged again?                                              |
| Phone process dies during relay                         | Watch receipt or relay completion acknowledgment   | Which durable store owns the message, and where does replay resume?                                           |
| Watch stores an event but its acknowledgment is lost    | Phone's knowledge of watch receipt                 | Can duplicate delivery be handled without duplicate user-visible or business effects?                         |
| User double-taps while the first intent is pending      | Whether a new logical action was intended          | What explicit interaction policy distinguishes repeat input from a new action?                                |
| Backend accepts an intent but its response is lost      | Caller knowledge of acceptance                     | Can the caller retry or query the same intent identity?                                                       |
| Execution request is submitted but response is lost     | Whether external execution occurred                | What idempotency or reconciliation mechanism establishes the outcome?                                         |
| Transaction succeeds but the watch remains disconnected | Watch knowledge of the authoritative outcome       | Can the watch retrieve the existing intent's outcome after reconnecting?                                      |
| Old worker resumes after losing its claim               | Current execution authority and latest state       | Can stale updates be rejected, and what prevents or reconciles duplicate external execution?                  |
| Event expires during prolonged disconnection            | Whether the event is still actionable              | Which component enforces expiry, and can the event still be displayed without authorizing an obsolete action? |

Each scenario needs a reproducible test with recorded expected and actual results. A written scenario is not evidence that recovery works.

## 12. Observability research

The existing component designs identify event IDs, message IDs, intent IDs, lifecycle callbacks, connection metrics, transaction states, and latency milestones.

### Integration finding

The system needs enough correlated evidence to determine where time was spent and where progress stopped.

At minimum, the integrated design should define timestamps or records for:

1. Event creation.
2. Publication acceptance.
3. Delivery attempt.
4. Phone durable receipt.
5. Relay attempt.
6. Watch durable receipt.
7. User gesture recognition.
8. Intent creation.
9. Backend intent receipt and acceptance.
10. Execution submission.
11. Execution outcome establishment.
12. Outcome persistence.
13. Outcome-delivery attempt.
14. Watch outcome receipt and presentation.

Monotonic clocks should be used for elapsed-time measurements within a process. Cross-device timestamps require caution because the devices may not have perfectly synchronized clocks.

The system should be able to separate:

- Queueing delay.
- Network and transport delay.
- Application processing time.
- Transaction execution time.
- Outcome-delivery delay.

The existing assessment symptom of a double-tap taking more than eight seconds is not proof of any specific bottleneck. Diagnosis requires timestamps and evidence from the actual execution path.

### Unresolved questions

- Which fields will be included in the common correlation context?
- How will sensitive values be excluded or redacted?
- Which metrics and latency distributions will be reported?
- How will the test harness export evidence?
- What retention and clock-synchronization assumptions apply?

## 13. Capacity and mobile-network limitations

The assessment requires analysis of 500,000 concurrent users across different mobile-network conditions and Android device restrictions.

The existing component designs identify adaptive heartbeats, bounded backoff, jitter, pending-work recovery, and observable connection state as relevant mechanisms.

### Research finding

A component-level connection strategy does not establish system-wide capacity.

Capacity depends on the actual transport, server architecture, heartbeat frequency, message volume, reconnect behavior, storage operations, and resource limits. None of those can be converted into a verified 500,000-user capacity claim without explicit assumptions and measurements.

Likewise, the Android documentation on Doze establishes that background network and scheduling activity can be restricted. It does not establish how a particular Transsion device, carrier, or application build will behave in the assessment scenario.

Source: Android Developers, Optimize for Doze and App Standby
https://developer.android.com/training/monitoring-device-state/doze-standby

### Integration implication

The integrated design must expose the inputs needed for a later capacity model and test plan, including:

- Expected concurrent connections.
- Heartbeat interval and payload.
- Reconnection attempt distribution.
- Event and intent arrival rates.
- Pending-work volume and retention.
- Delivery-worker throughput.
- Storage throughput and contention.
- Queueing delay and recovery time.
- Server CPU, memory, socket, and connection limits.

The dedicated capacity analysis must state its assumptions, calculations, and measurements separately.

### Unresolved questions

- What workload profile is required by the assessment?
- What are the selected heartbeat and retry parameters?
- Which server and connection-gateway architecture will be implemented?
- What network and device profiles will be simulated?
- What load-testing environment and acceptance criteria will be used?

## 14. Security and trust boundaries

The integrated architecture crosses multiple trust boundaries:

- Backend business services and delivery infrastructure.
- Backend and registered phone devices.
- Phone and paired watch.
- Watch interaction and backend transaction authorization.
- Backend transaction processing and an execution provider.

A message's arrival does not automatically establish that it is authentic, authorized, fresh, or valid for the current business state.

The event source, relay, and transaction processor must retain their separate responsibilities. The backend must independently authorize a transaction intent even if it originated from a previously valid event and arrived through a paired device.

The BLE or network transport's security properties do not, by themselves, define the complete application authorization contract.

The following decisions remain unresolved:

- Device identity and registration.
- Message authentication and integrity.
- Authorization policy for transaction intents.
- Key and credential management.
- Expiry and replay protection.
- Sensitive-data handling in local storage and diagnostic records.

These matters must be resolved in the component designs before production security claims can be made.

## 15. Requirements mapping

The integrated research supports planning and analysis for these assessment requirements:

| Requirement       | Research contribution                                                                     | Remaining work                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| REQ-ARCH-001      | Identifies the complete event-to-transaction chain and component boundaries               | Produce the integrated architecture diagram and verify it against the component designs |
| REQ-ARCH-002      | Distinguishes event publication, durable handoff, and phone receipt                       | Finalize the integrated publication and delivery contracts                              |
| REQ-ARCH-003      | Identifies connection recovery, background execution, and liveness boundaries             | Implement and test the connection manager; verify Android-specific behavior             |
| REQ-ARCH-004      | Identifies intent identity, uncertain execution, duplicate delivery, and outcome recovery | Define and verify the complete end-to-end transaction flow                              |
| REQ-ARCH-005      | Identifies network and background-execution constraints relevant to the system            | Produce the dedicated analysis of five African mobile-network failure modes             |
| REQ-CONN-006      | Identifies the need for stable identities and explicit pending-work ownership             | Finalize storage, acknowledgment, retry, and retention contracts                        |
| REQ-CONN-007      | Identifies lifecycle and acknowledgment events needed across boundaries                   | Implement and verify callbacks                                                          |
| REQ-CONN-010      | Separates backend liveness from BLE liveness                                              | Implement and test network-change and BLE-related recovery behavior                     |
| REQ-DIAG-001–005  | Establishes the need for correlated timestamps and evidence-based diagnosis               | Produce diagnostic analyses and reproduce the required scenarios                        |
| REQ-TRADE-001–003 | Identifies foreground execution, connection strategy, and relay choices                   | Complete the trade-off comparisons and associated decisions                             |
| REQ-SCALE-001     | Identifies inputs for the 500,000-user capacity model                                     | Calculate capacity under explicit assumptions and perform required load tests           |
| REQ-TEST-001–007  | Identifies cross-component recovery and verification scenarios                            | Implement the test harness and record actual results and evidence                       |
| REQ-TRACE         | Connects component boundaries to requirements and future verification                     | Update the traceability document after design and ADR review                            |

This mapping is planning evidence. It does not change any requirement to Verified.

## 16. Research conclusions

The existing component designs provide a foundation for an integrated architecture, but the overall system still needs explicit cross-component contracts.

The most important conclusions are:

1. **Delivery milestones are distinct.** Publication, phone storage, watch storage, intent acceptance, execution, and outcome communication require separate evidence.
2. **Stable identities must survive recovery.** Event, message, and transaction-intent identities serve different purposes and must not be conflated.
3. **Retries require receiver-side duplicate handling.** A sender cannot infer non-receipt or non-execution from a missing response.
4. **Transport success is not application success.** Socket writes, BLE transfer operations, and message-queue acceptance do not automatically prove durable application processing.
5. **Uncertain execution must remain uncertain until resolved.** A timeout is not proof of transaction failure, and a local claim or lease does not by itself guarantee single external execution.
6. **Outcome recovery is part of the transaction lifecycle.** The system must be able to recover the authoritative result of an existing intent without creating another transaction.
7. **Mobile behavior must be tested at the appropriate level.** Simulation, Android emulator tests, physical-device tests, carrier tests, and production-scale measurements establish different kinds of evidence.

The next artifact should convert these findings into `docs/design/integrated-architecture.md`. That design must define the end-to-end architecture, handoff contracts, recovery responsibilities, and unresolved decisions without claiming unverified behavior.

The integrated architecture ADR should follow the design review. Only after those artifacts are reviewed should the traceability audit be updated to reflect the newly documented architecture and its actual verification status.
