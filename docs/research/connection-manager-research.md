# Adaptive Connection Manager Research

## 1. Purpose

Research the documented behavior and constraints relevant to implementing `AdaptiveConnectionManager` for the Clockit real-time event-to-transaction streaming assessment.

This research supports requirements `REQ-CONN-001` through `REQ-CONN-011`. It does not establish that the proposed behavior has been implemented or verified on physical devices.

## 2. Research Findings

### 2.1 WebSocket liveness

**Documented fact:** RFC 6455 defines WebSocket Ping and Pong control frames. A receiving endpoint must respond to a Ping with a Pong, and Ping can be used as a keepalive or to check whether the remote endpoint is responsive.

**Engineering implication:** The connection manager needs a way to send a heartbeat, measure its round-trip time, detect a missing response within a deadline, and initiate recovery when the connection is suspected to have failed.

**Limitation:** A heartbeat response demonstrates responsiveness at that moment. It does not guarantee that the connection will remain usable afterward.

**Source:** RFC 6455, Sections 5.5.2 and 5.5.3.
https://www.rfc-editor.org/rfc/rfc6455

### 2.2 Android network-change detection

**Documented fact:** Android provides `ConnectivityManager.NetworkCallback` to notify applications about network availability, loss, and changes in network capabilities.

Android documents that the existence of a network does not necessarily mean it provides usable internet access. Network capabilities should be considered when determining whether a network has internet connectivity and whether that connectivity has been validated.

**Engineering implication:** The manager should react to network changes and reassess or re-establish its backend connection when necessary. It should monitor actual WebSocket health separately from Android's network state.

**Limitation:** Network callbacks do not report the exact state of a remote WebSocket or the expiry time of a carrier's NAT mapping.

**Sources:**

- Android, `ConnectivityManager.NetworkCallback`: https://developer.android.com/reference/android/net/ConnectivityManager.NetworkCallback
- Android, Read network state: https://developer.android.com/develop/connectivity/network-ops/reading-network-state

### 2.3 Doze and background execution

**Documented fact:** Android Doze can suspend network access, defer jobs and synchronizations, defer ordinary alarms, and ignore wake locks. Android recommends considering Firebase Cloud Messaging for downstream messaging rather than maintaining a separate persistent connection when possible.

**Engineering implication:** A heartbeat scheduler cannot guarantee that a heartbeat will execute at its intended time. The manager must account for delayed execution, missed deadlines, and recovery when execution resumes.

**Limitation:** A simulated heartbeat scheduler cannot prove that a real Android device will execute the same schedule while idle or under OEM-specific restrictions.

**Source:** Android, Optimize for Doze and App Standby.
https://developer.android.com/training/monitoring-device-state/doze-standby

### 2.4 Foreground-service restrictions

**Documented fact:** Android foreground services must display a notification. Apps targeting Android 12 and later face restrictions on starting foreground services from the background, with defined exceptions. Newer Android versions add service-type and permission requirements.

**Engineering implication:** The assessment's protection and unprotection methods should make the requested execution state explicit. The implementation and documentation must distinguish a request for persistent execution from a guarantee that the process cannot be stopped.

**Limitation:** The appropriate service type and any applicable platform or distribution-policy requirements must be evaluated against the actual application use case and target Android versions.

**Sources:**

- Android, Services overview: https://developer.android.com/develop/background-work/services
- Android, Restrictions on starting a foreground service from the background: https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
- Android, Foreground service types: https://developer.android.com/develop/background-work/services/fgs/service-types

### 2.5 Push messaging as a complementary recovery path

**Documented fact:** Firebase Cloud Messaging supports different delivery priorities. High-priority messages are intended for time-sensitive, user-visible content and may allow limited processing when a device is idle. Processing time is limited, and high-priority use can be deprioritized when messages do not produce appropriate user-visible outcomes.

**Engineering implication:** FCM is a candidate for notifying or waking a phone when a persistent connection is unavailable. It should be evaluated as a complementary delivery mechanism rather than assumed to guarantee delivery or replace backend durability and acknowledgment.

**Limitation:** The assessment requires connection-management behavior. Whether FCM belongs in the implementation, beyond the design and trade-off discussion, remains an explicit decision.

**Source:** Firebase, Set and manage Android message priority.
https://firebase.google.com/docs/cloud-messaging/android-message-priority

## 3. Idle-Timeout Learning: Evidence Requirements

The assessment requires the manager to estimate the effective idle timeout using an exponential moving average (EMA) or a comparable method.

A disconnection alone does not establish that a NAT timeout caused it. Other possible causes include:

- Radio or network interruption.
- A change in the device's default network.
- Remote server or gateway failure.
- Android suspending or stopping application execution.
- A connection becoming unusable without a clean close signal.

The estimator therefore needs explicit sample-acceptance rules.

Each observation should record the relevant idle duration, outcome, observation source, and any known confounding conditions. Ambiguous failures should not automatically be treated as confirmed NAT-timeout samples.

The initial estimate, estimator parameters, sample-validation rules, and behavior when there is insufficient evidence remain open design decisions.

## 4. Heartbeat Scheduling

The assessment requires heartbeats at approximately 70â€“85% of the learned idle timeout, with jitter.

The implementation design must define:

- How the heartbeat interval is derived from the current estimate.
- How jitter is applied.
- How a changed estimate affects an already scheduled heartbeat.
- How heartbeat deadlines and late responses are handled.
- How a missing response triggers recovery.
- How the implementation behaves when the estimate is unavailable or unreliable.

The assessment specifies the target interval range but does not provide a validated initial timeout or a complete scheduling algorithm.

## 5. Reconnection and Network Quality

The assessment requires exponential backoff and jitter, with network quality taken into account.

Android network callbacks provide evidence about network availability and capabilities. The actual backend connection provides separate evidence through connection outcomes, heartbeat responses, and round-trip times.

The design must define how these observations influence retry decisions, how retry delays are bounded, and how sustained outages avoid excessive or synchronized retry traffic.

Exact delay limits and quality classifications remain open design decisions until justified by the implementation requirements and tests.

## 6. Pending Work and Duplicate Safety

The assessment allows either an in-memory or durable outbox for unacknowledged outbound events or user intents.

Pending work must have defined retention, acknowledgment, retry, and recovery behavior. Retrying a request must not, by itself, cause its underlying transaction to execute more than once.

This requires an explicit acknowledgment contract and transaction idempotency behavior. The phone-side outbox alone cannot guarantee exactly-once transaction execution if the backend does not support appropriate duplicate protection.

Durability across process death should be evaluated against the assessment's reported recovery failures. An in-memory outbox loses its contents when the process and memory are lost.

## 7. BLE Liveness Boundary

The assessment explicitly states that BLE activity must not be treated as proof that the phone-to-backend connection is alive.

The phone-to-watch connection and the phone-to-backend connection are separate communication paths. Evidence that one is active does not establish that the other is active.

Any BLE-based liveness signal should therefore be tracked independently and must not reset the backend connection's learned idle-timeout observations.

## 8. Research Conclusions

The available official documentation supports the following conclusions:

1. WebSocket heartbeat responses can provide evidence of remote responsiveness.
2. Android network callbacks can identify network changes but cannot establish remote socket health or a carrier NAT expiry time.
3. Doze and background-execution restrictions prevent a heartbeat scheduler from guaranteeing uninterrupted execution.
4. Foreground-service protection is subject to platform requirements and does not guarantee survival against every system or OEM restriction.
5. FCM is a possible complementary delivery path, subject to its documented behavior and constraints.
6. Timeout learning, adaptive scheduling, reconnection policy, pending-work recovery, and duplicate safety require explicit implementation decisions and tests.

This research does not establish any particular carrier timeout, OEM-specific failure cause, optimal retry interval, or production reliability figure.

## 9. Verification Status

- Official documentation reviewed: Yes, for the sources listed above.
- Connection manager implemented: Not established by this document.
- Automated tests executed: Not established by this document.
- Physical-device tests executed: Not established by this document.
- Carrier NAT behavior verified on target networks: Not established by this document.
- OEM-specific behavior verified on target devices: Not established by this document.

## 10. References

1. IETF, RFC 6455 â€” The WebSocket Protocol: https://www.rfc-editor.org/rfc/rfc6455
2. Android Developers, `ConnectivityManager.NetworkCallback`: https://developer.android.com/reference/android/net/ConnectivityManager.NetworkCallback
3. Android Developers, Read network state: https://developer.android.com/develop/connectivity/network-ops/reading-network-state
4. Android Developers, Optimize for Doze and App Standby: https://developer.android.com/training/monitoring-device-state/doze-standby
5. Android Developers, Services overview: https://developer.android.com/develop/background-work/services
6. Android Developers, Restrictions on starting a foreground service from the background: https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
7. Android Developers, Foreground service types: https://developer.android.com/develop/background-work/services/fgs/service-types
8. Firebase, Set and manage Android message priority: https://firebase.google.com/docs/cloud-messaging/android-message-priority
