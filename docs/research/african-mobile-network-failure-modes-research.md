# African Mobile-Network Failure Modes Research

**Status:** Research completed; design mapping documented; implementation and verification pending
**Date:** 28 October 2026
**Requirement:** REQ-ARCH-005 — African Mobile-Network Failure Modes
**Scope:** Mobile-network conditions relevant to Clockit's event-to-transaction system, using Nigerian evidence and official platform documentation. Broader African applicability must be verified in each target market.

## 1. Purpose

Identify five distinct mobile-network failure modes that can interrupt the path from a backend event to a phone, from the phone to a watch, or from a transaction request to its confirmed outcome.

For each mode, this document records:

- The real-world behavior supported by available evidence.
- The effect on connectivity, event delivery, transaction-intent handling, or recovery.
- The relevant mitigation in the proposed Clockit design.
- The evidence needed to distinguish the failure from other possible causes.
- What remains unverified.

The five modes are selected because they affect different parts of the system. They are not claimed to be the five most frequent failures across Africa. The sources reviewed do not establish a continent-wide frequency ranking.

## 2. Evidence and limitations

### 2.1 Nigerian evidence

The Nigerian Communications Commission (NCC) documents multiple layers of the telecommunications system and their failure conditions:

- Base-station sites can be affected by power outages, equipment faults, access restrictions, theft, and vandalism.
- Congestion can slow calls and data when demand exceeds available capacity.
- Fibre cuts can disrupt the backhaul used by mobile broadband.
- Core-network failures and capacity limits can affect service over wider areas.

Sources:

- NCC, [Quality of Experience and Interactive Telecom Value Chain](https://www.ncc.gov.ng/quality-experience).
- NCC, [Joint committee established to address fibre cuts](https://ncc.gov.ng/media-centre/press-releases/ministries-set-joint-committee-tackle-fiber-cuts-during-road).

The NCC's [network performance reporting](https://www.ncc.gov.ng/market-data-reports/network-performance-report) also examines urban–rural performance, network capacity, responsiveness, and differences between operators and technologies.

These sources establish that the conditions are relevant to Nigerian mobile connectivity. They do not establish how often each condition will interrupt Clockit, nor do they provide enough evidence to rank the five modes by frequency.

### 2.2 Android platform evidence

Android documents that:

- A network can be configured for internet access without currently providing validated public internet access.
- Connectivity and network capabilities can change during an app's lifetime.
- When the default network changes, existing connections on the previous network may subsequently be terminated.
- Network callbacks can report availability, loss, and changes in network capabilities.

Source: [Android Developers — Read network state](https://developer.android.com/develop/connectivity/network-ops/reading-network-state).

These are platform behaviors, not proof that a specific Nigerian mobile operator or device experiences them at a particular rate.

### 2.3 Evidence classification

This document distinguishes three things:

1. **Documented behavior:** A source establishes that a failure condition or platform behavior exists.
2. **Design response:** A proposed Clockit mechanism intended to limit the failure's effect.
3. **Verification still required:** A test or measurement needed to establish that the mechanism actually works under the relevant conditions.

No Clockit implementation results, field measurements, operator-specific measurements, or physical-device results are established by this research.

## 3. Failure mode 1 — Weak, intermittent, or unavailable radio coverage

### Real-world behavior

A phone may have no usable mobile signal, or a signal may become too weak or unstable to sustain reliable data communication. Coverage can vary with location, physical obstructions, and network deployment.

The NCC's [Quality of Experience resource](https://www.ncc.gov.ng/quality-experience) identifies no-signal areas and explains that service quality varies with location and infrastructure conditions.

The precise frequency and duration of such interruptions in Clockit's target locations are not yet measured.

### Effect on Clockit

- **Connectivity:** The phone may be unable to establish or maintain its backend connection.
- **Event delivery:** Events waiting for the phone cannot be delivered while the required network path is unavailable.
- **Transaction intent:** A watch-generated intent may remain stored locally or queued on the phone rather than reaching the backend.
- **Recovery:** Work may accumulate while the phone is offline and require delivery after connectivity returns.

A missing heartbeat during this condition does not, by itself, prove that the backend, phone process, or server is down.

### Proposed design mitigation

The adaptive connection manager uses explicit connection states, heartbeat response deadlines, and bounded reconnection with backoff and jitter.

Pending work retains stable identities in the relevant durable store. After connectivity returns, the system should re-establish a usable session, reconcile pending work, and resume delivery without creating new logical transaction intents merely because the connection was interrupted.

The backend event-delivery design retains unacknowledged work. The transaction-processing design preserves the original intent identity and treats uncertain execution separately from confirmed failure.

These are proposed design behaviors; their implementation and recovery guarantees remain unverified.

### Diagnostic evidence

Collect:

- Network availability and capability changes reported by Android.
- Connection state transitions and reconnect attempts.
- Last successful heartbeat time and round-trip time.
- Time when an event was queued, sent, acknowledged, and stored by the receiving application.
- Time when connectivity returned and pending work began recovering.
- Whether the app process remained alive during the interruption.

A useful test removes network access while keeping the app process alive, then restores access and checks whether pending work recovers with the same identifiers.

### Verification still required

Test intermittent and sustained network loss under controlled conditions. Confirm that work remains recoverable, reconnect attempts remain bounded, and recovery does not create a second transaction intent.

## 4. Failure mode 2 — Congestion and highly variable response times

### Real-world behavior

A network can remain available while its performance deteriorates under load. Requests may take longer, responses may arrive late, and connections may become unreliable from the application's perspective.

The NCC's [Quality of Experience resource](https://www.ncc.gov.ng/quality-experience) identifies network congestion as a cause of slower calls and data. Its [network performance reports](https://www.ncc.gov.ng/market-data-reports/network-performance-report) include capacity, responsiveness, and regional performance analysis.

The sources establish congestion as a relevant network condition. They do not establish Clockit's expected latency distribution or a universal delay threshold for African networks.

### Effect on Clockit

- **Connectivity:** A connection may still exist even when responses are slow.
- **Event delivery:** Delivery and application acknowledgments may be delayed.
- **Transaction intent:** A request may reach the backend and be accepted even if the response arrives after the phone or watch's timeout.
- **Recovery:** An overly aggressive timeout can cause unnecessary reconnects or retries, increasing load when the network is already under pressure.

A slow response is not proof that a request failed. In particular, a transaction request may have been accepted or executed even if the caller did not receive the response in time.

### Proposed design mitigation

The adaptive connection manager separates the learned idle-timeout estimate from the deadline for an individual heartbeat response.

Heartbeat scheduling uses the proposed 70–85% of the learned idle-timeout estimate, with jitter. Reconnection uses bounded exponential backoff and jitter to reduce synchronized retry storms.

Transaction processing uses a stable intent ID and idempotent request handling. When the execution result is uncertain, the system should reconcile the existing intent instead of blindly creating or executing a new one.

Timeout values, retry limits, and latency thresholds remain configuration and verification decisions. They must not be presented as proven optimal values before measurement.

### Diagnostic evidence

Collect:

- Request and response timestamps at each system boundary.
- Heartbeat round-trip-time distribution.
- Connection failures and reconnect attempts over time.
- Backend queue depth and oldest pending item age.
- Event-delivery and application-acknowledgment latency.
- Intent acceptance latency, execution latency, and outcome-delivery latency as separate measurements.
- Whether delays correlate with a particular location, operator, technology, or time period.

A useful test injects increasing latency and delayed responses while keeping the connection available. Confirm that the system does not interpret every slow response as a definite transaction failure.

### Verification still required

Measure behavior under controlled latency, jitter, and packet-loss scenarios. Then conduct field measurements on representative target networks before choosing production thresholds.

## 5. Failure mode 3 — Network handover and connection replacement

### Real-world behavior

A phone's default network can change during its lifetime. For example, a device may switch between Wi-Fi and mobile data, or its mobile connectivity may be re-established after a network interruption.

Android documents that a new default network can replace the previous one and that remaining connections on the previous network may be terminated. A network that reconnects is represented by a new Android `Network` object.

Source: [Android Developers — Read network state](https://developer.android.com/develop/connectivity/network-ops/reading-network-state).

This establishes the platform-level possibility of connection replacement. It does not prove that every handover interrupts every socket or that every handover produces a measurable outage.

### Effect on Clockit

- **Connectivity:** The device may have a new usable network while an existing WebSocket or other connection is no longer usable.
- **Event delivery:** A previously active connection may stop delivering events even though the phone now reports network availability.
- **Transaction intent:** An intent or acknowledgment may be in flight when the old connection becomes unusable.
- **Recovery:** The client must determine whether the old session is still usable and establish a new session when required.

Network availability is not equivalent to proof that the existing backend application connection is healthy.

### Proposed design mitigation

The connection manager observes network changes and connection-level liveness separately.

When the active connection fails, it moves through the defined connection states, reconnects using bounded backoff and jitter, and verifies that the new session is usable before resuming pending delivery.

Stable event and intent identifiers allow the receiving system to recognize retried work. A successful socket write or a network-change callback does not, by itself, establish that the receiving application stored the message.

### Diagnostic evidence

Collect:

- Android network callback timestamps and reported capabilities.
- Old and new network/session identifiers where safely available.
- Socket close events, heartbeat timeouts, and reconnect start/completion times.
- Event and intent IDs associated with messages in flight.
- Application-level acknowledgment status before and after handover.

A useful test switches between Wi-Fi and mobile data while an event is in flight. Confirm that the connection manager recovers and that repeated delivery does not create duplicate logical work.

### Verification still required

Test actual network transitions on supported Android versions and representative devices. The initial simulated connection tests cannot establish real operating-system or operator behavior.

## 6. Failure mode 4 — Shared infrastructure outage

### Real-world behavior

Mobile service depends on infrastructure beyond the radio link. A base station requires functioning equipment and power, while mobile broadband may depend on fibre backhaul and core-network services.

The NCC identifies power outages, equipment faults, fibre cuts, and core-network outages as causes of service disruption. Its [fibre-cut announcement](https://ncc.gov.ng/media-centre/press-releases/ministries-set-joint-committee-tackle-fiber-cuts-during-road) describes fibre damage as a cause of telecommunications service disruption in Nigeria.

An infrastructure outage can affect one site, a wider area, or multiple services. The actual scope depends on the affected component and the available redundancy. This research does not establish the outage scope for any particular operator or incident.

### Effect on Clockit

- **Connectivity:** Multiple phones may lose connectivity or access to backend services at the same time.
- **Event delivery:** Pending deliveries can accumulate across many devices.
- **Transaction intent:** Intents may remain queued, or a request already submitted may have an uncertain outcome.
- **Recovery:** Many clients may reconnect together when service returns, creating a reconnect storm and a backlog of pending work.

A shared outage is different from one phone losing signal: many clients can be affected by the same underlying infrastructure problem.

### Proposed design mitigation

The connection manager uses bounded exponential backoff and jitter rather than continuous immediate retries.

The backend delivery design retains durable per-device delivery state and retries pending work. Stable identifiers and duplicate-safe processing allow the system to resume delivery without treating every retry as new business work.

The integrated architecture requires explicit ownership of pending work, observable recovery queues, and separation between request delivery, transaction execution, and outcome communication.

These mechanisms can reduce duplicate processing and synchronized retry pressure. They cannot restore an unavailable mobile operator, guarantee uninterrupted service, or establish that the system can handle 500,000 concurrent users without capacity testing.

### Diagnostic evidence

Collect:

- The number and geographic distribution of affected clients, where available and privacy-appropriate.
- Network reachability, connection failures, and reconnect rates over time.
- Backend service health and queue depth.
- Pending-delivery count and oldest-item age.
- Recovery throughput after service restoration.
- Whether multiple unrelated devices fail within the same time window.

A useful simulation disconnects many clients together, restores service, and measures reconnect behavior and backlog recovery.

### Verification still required

Run coordinated failure-and-recovery tests and load tests. Measure retry traffic, resource consumption, recovery time, and queue-drain rate. Separate simulation results from real operator-outage evidence.

## 7. Failure mode 5 — Partial connectivity: network available, required service unreachable

### Real-world behavior

A device can have a network configured for internet access without currently having validated public internet access.

Android documents that `NET_CAPABILITY_INTERNET` describes a network configured for internet access, while `NET_CAPABILITY_VALIDATED` indicates that the system has probed and found public internet access. Even a validated network can subsequently lose connectivity.

Source: [Android Developers — Read network state](https://developer.android.com/develop/connectivity/network-ops/reading-network-state).

This category also covers cases where the device can reach some destinations but the specific backend service or connection is not usable. Android's general network-state signals alone cannot prove that Clockit's backend endpoint is reachable.

The exact cause may be DNS resolution, routing, service unavailability, filtering, or another path-specific problem. These are hypotheses to investigate from evidence, not causes to assume from a failed heartbeat alone.

### Effect on Clockit

- **Connectivity:** The phone may report a network as available while Clockit's backend connection cannot be established or maintained.
- **Event delivery:** Delivery attempts may fail even though other apps appear to have internet access.
- **Transaction intent:** The phone may be unable to submit an intent or retrieve its authoritative outcome.
- **Recovery:** Reconnecting repeatedly to an unreachable endpoint may waste resources without resolving the underlying problem.

The important distinction is between “the device has a network” and “the application can communicate with the required service.”

### Proposed design mitigation

The connection manager treats the actual application connection and heartbeat response as separate evidence from general network availability.

Network callbacks help identify changes in connectivity, but the application must still verify its backend session. Reconnection remains bounded and pending work retains stable identities.

The transaction system preserves uncertainty when it cannot establish whether execution occurred. If an accepted intent's response is lost, recovery must query or reconcile the original intent rather than submit a new transaction merely because the endpoint became unreachable.

### Diagnostic evidence

Collect:

- Android network availability and validation signals.
- DNS and connection-establishment errors where available.
- Backend endpoint reachability and service health.
- WebSocket close codes or transport errors.
- Heartbeat and request timeouts.
- Whether unrelated public endpoints are reachable, where such checks are safe and permitted.
- The status of the original event or transaction intent at the backend.

A useful test leaves the device's network available but makes the target service unreachable. Confirm that the application distinguishes network availability from application-session health and preserves pending work.

### Verification still required

Test DNS failure, endpoint unavailability, and connection interruption independently. Verify that diagnostics distinguish the observed symptoms without claiming a root cause that the available evidence cannot establish.

## 8. Cross-cutting recovery rules

The five modes have different causes, but the proposed system should apply several consistent rules.

### 8.1 Delivery is not execution

A successful network send does not prove that the receiving application durably stored the message. An application acknowledgment does not prove that a transaction executed. A transaction result does not prove that the watch received or displayed it.

Each milestone needs its own evidence.

### 8.2 Preserve identity across retries

A retried event retains its event ID. A retried transaction request retains its intent ID. A retry must not automatically create a new logical transaction.

The backend must enforce the applicable idempotency and concurrency rules. A client-side retry policy alone cannot guarantee that an external transaction executes only once.

### 8.3 Keep uncertain outcomes uncertain

If the connection fails after a request was submitted, the system must not infer that the transaction failed merely because the response was lost.

It should reconcile the original intent using authoritative execution status or supported idempotency. If neither resolves the outcome, it must preserve the uncertainty rather than blindly resubmit.

### 8.4 Preserve pending work

Pending work must remain recoverable in the authoritative store responsible for it. A process interruption or failed transport write must not silently delete the only recoverable copy.

The phone inbox-to-relay handoff requires an explicit durable ownership-transfer rule and an interruption/restart test.

### 8.5 Avoid retry storms

Reconnection and delivery retries need bounded delays, jitter, and explicit retry limits. After a shared outage, recovery capacity and backlog size must be measured rather than assumed.

## 9. Mapping to the proposed Clockit architecture

| Failure mode                  | Relevant design components                                                | Proposed response                                                                                     | Verification needed                                        |
| ----------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Weak or intermittent coverage | Adaptive connection manager, backend event delivery, phone-to-watch relay | Detect failed sessions, retain pending work, reconnect, resume with stable identities                 | Controlled loss/restoration and representative field tests |
| Congestion and variable delay | Adaptive connection manager, backend delivery, transaction processing     | Separate heartbeat response deadlines from learned timeout; bounded retries; preserve intent identity | Injected latency/jitter and measured field latency         |
| Network handover              | Adaptive connection manager, phone-to-watch relay                         | Observe network changes, validate session liveness, reconnect and safely resume                       | Real Wi-Fi/mobile transitions on supported devices         |
| Infrastructure outage         | Backend event delivery, connection manager, transaction processing        | Durable pending work, jittered reconnects, idempotent retries, observable backlog recovery            | Coordinated outage simulation and load testing             |
| Partial connectivity          | Connection manager, backend delivery, transaction processing              | Test actual service-session health, diagnose path failures, preserve uncertain outcomes               | Independent DNS, endpoint, and service-reachability tests  |

## 10. Requirement coverage and remaining work

**REQ-ARCH-005 — Research coverage:** The five failure categories, their system effects, proposed design mitigations, and required diagnostic evidence are documented here.

This is not proof of implementation or operational reliability.

The following remain outstanding:

- Implement and test the proposed mitigations.
- Verify event delivery and transaction-intent recovery under each failure mode.
- Measure behavior on representative devices and mobile networks in the actual target environments.
- Record test conditions, observed results, failures, and limitations.
- Complete the separate trade-off analysis and capacity model required by other assessment requirements.
- Update the assessment traceability document when this research file is saved and reviewed.

## 11. Sources

1. Nigerian Communications Commission, [Quality of Experience and Interactive Telecom Value Chain](https://www.ncc.gov.ng/quality-experience). Official evidence about Nigerian telecom components, power failures, congestion, fibre cuts, equipment faults, and service quality.
2. Nigerian Communications Commission, [Fibre-cut protection initiative](https://ncc.gov.ng/media-centre/press-releases/ministries-set-joint-committee-tackle-fiber-cuts-during-road). Official report describing the effect of fibre damage on Nigerian telecommunications services.
3. Nigerian Communications Commission, [Network Performance Reports](https://www.ncc.gov.ng/market-data-reports/network-performance-report). Official reports on network performance, capacity, responsiveness, and geographic differences.
4. Android Developers, [Read network state](https://developer.android.com/develop/connectivity/network-ops/reading-network-state). Official platform documentation for network capabilities, validation, default-network changes, and connectivity callbacks.
