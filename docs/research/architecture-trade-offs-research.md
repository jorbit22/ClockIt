# Architecture Trade-Offs Research: Delivery, Battery, and Watch Connectivity

**Project:** Clockit Event Streaming
**Date:** 28 October 2026
**Status:** Research completed; proposed design direction documented; implementation and verification pending
**Scope:** REQ-TRADE-001, REQ-TRADE-002, and REQ-TRADE-003

## 1. Purpose

This document examines three architecture decisions that affect Clockit's ability to deliver time-sensitive events to a phone and smartwatch:

1. Whether the phone should maintain a persistent connection to the backend or rely mainly on push notifications.
2. How to balance battery consumption against delivery reliability.
3. Whether the smartwatch should communicate directly with the backend or use the phone as its primary relay.

The goal is to identify a design direction supported by platform documentation, explain its limitations, and define the tests required before claiming that the design works reliably.

This document does not claim that the proposed design has been implemented or proven on real devices.

## 2. Evidence and decision rules

The following distinctions apply throughout this document.

- **Documented platform behavior:** Behavior described in official Android, Firebase, or Wear OS documentation.
- **Proposed Clockit design:** A design choice based on the assessment requirements and documented platform behavior.
- **Unverified assumption:** A claim that still requires measurement or testing.
- **Verification required:** Evidence that must be collected before treating the design as proven.

Official platform documentation explains supported behavior and restrictions. It does not establish the actual delivery latency, battery consumption, or reliability of Clockit on every phone, carrier, or watch.

## 3. REQ-TRADE-001 â€” Foreground Service Versus Push Delivery

### 3.1 The two approaches

**Approach A: Persistent connection managed by a foreground service**

The Clockit phone application maintains a live backend connection while an eligible foreground service runs.

The backend can publish events through that connection without first waiting for a push notification to wake the application.

A foreground service makes ongoing work more visible to Android and the user. It does not guarantee that the network connection will remain available or that every event will arrive immediately.

**Approach B: Delivery based mainly on Firebase Cloud Messaging (FCM)**

The backend sends a push message through FCM. Android delivers the message according to the applicable priority, device state, network availability, and platform restrictions.

The application processes the message and presents a notification or performs permitted follow-up work.

This avoids requiring the application to maintain a permanent network connection solely for incoming events. However, FCM is not an unconditional guarantee of immediate delivery.

### 3.2 Evidence from official documentation

#### Android foreground-service restrictions

Official documentation:

https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start

Android 12 and later restrict starting foreground services while an application is in the background, subject to documented exemptions. High-priority FCM messages can qualify for an exemption, but FCM may downgrade messages that do not meet its high-priority criteria. Attempting to start a foreground service based on a downgraded message can fail.

Newer Android versions also impose additional foreground-service type and permission requirements.

**Design implication:** Clockit cannot assume that receiving any push message allows it to start a foreground service. The implementation must follow the applicable Android version's restrictions.

#### FCM message priority

Official documentation:

https://firebase.google.com/docs/cloud-messaging/android-message-priority

Normal-priority messages may be delayed during Doze. High-priority messages are intended for time-sensitive, user-visible content and attempt to be delivered promptly, including by waking a device when permitted.

High-priority delivery is not an unlimited background-processing mechanism. The application has limited time to process a received message, and messages that do not result in appropriate user-visible outcomes may be deprioritized.

**Design implication:** Push messages should be designed to support timely notification and recovery. Clockit must not treat FCM as a guaranteed, permanent replacement for its streaming connection.

#### Doze and App Standby

Official documentation:

https://developer.android.com/training/monitoring-device-state/doze-standby

Android can defer background network access and other work while a device is idle. Network access and scheduled work may become available during maintenance windows.

The documentation recommends considering FCM when an application needs downstream messaging rather than maintaining its own persistent connection while idle.

**Design implication:** A persistent connection may not behave the same way across foreground use, background use, and prolonged idle periods.

#### Background network and battery use

Official documentation:

https://developer.android.com/topic/performance/issues/bg-network-usage

Repeated background network activity can wake the device's processor and network radio, increasing energy consumption.

**Design implication:** The persistent-connection approach needs battery measurements. Its delivery benefits should not be assumed to justify its energy cost without testing.

### 3.3 Comparison

| Consideration          | Persistent foreground-service connection                                               | FCM-based delivery                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Delivery path          | Existing live connection when healthy                                                  | Push infrastructure followed by device delivery                                        |
| Latency                | Can be low while the connection is healthy; not guaranteed                             | Can be prompt, especially for eligible high-priority messages; not guaranteed          |
| Background behavior    | Subject to Android service restrictions and network changes                            | Designed to support downstream messaging under Android background-management rules     |
| Application lifecycle  | Requires explicit connection, service, and recovery management                         | Requires message handling and appropriate notification or follow-up behavior           |
| Battery                | Ongoing connection and heartbeat costs may accumulate                                  | Avoids requiring a permanent application-managed connection solely for push delivery   |
| Platform restrictions  | Foreground-service start rules, service types, permissions, and lifecycle restrictions | Message priority, processing limits, Doze behavior, and delivery policies              |
| Operational complexity | Connection lifecycle, heartbeat, timeout learning, reconnect, and duplicate handling   | Push registration, message delivery, priority, token management, and fallback behavior |
| Main limitation        | A live connection can break or become unavailable                                      | Push delivery timing and availability are not under Clockit's complete control         |

### 3.4 Proposed Clockit direction

Use the phone's connection manager as the primary streaming path when the application is permitted to maintain that connection and the required delivery behavior justifies its cost.

Use FCM as a complementary mechanism for appropriate user-visible notifications and recovery opportunities. Do not assume that a push message always arrives immediately or can always restart a foreground service.

The implementation should define what happens when:

- The streaming connection is healthy.
- The connection breaks while the application is in use.
- The application is in the background.
- Android restricts background execution.
- A push message arrives while streaming is unavailable.
- A push message is delayed, duplicated, or absent.
- The application restarts after missing events.

The system must have a defined recovery path for missed events. A notification should not be treated as proof that every underlying event has been durably received and processed.

**Decision status:** Proposed direction; implementation and device verification pending.

## 4. REQ-TRADE-002 â€” Battery Consumption Versus Reliability

### 4.1 The underlying trade-off

A connection can fail without the application immediately knowing it has failed.

For example, the phone may lose coverage while the application still believes its socket is open. If the application waits too long before detecting the failure, events may be delayed. If it checks too frequently, it may consume unnecessary battery and network resources.

Clockit therefore needs a strategy for detecting stale connections, keeping healthy connections usable, and recovering after failures without creating excessive network activity.

### 4.2 Heartbeat frequency

A heartbeat is a small message exchanged to help determine whether a connection remains responsive.

More frequent heartbeats can help detect some failures sooner. However, each heartbeat creates work and may contribute to radio and processor activity.

Less frequent heartbeats reduce that activity but can increase the time before some connection failures are detected.

The actual relationship depends on device state, network behavior, operating-system restrictions, and the connection path.

### 4.3 Learned idle timeout

The assessment requirement specifies that Clockit should use an estimated or learned idle timeout, or a comparable approach, to inform heartbeat scheduling.

The connection manager should maintain the best available estimate of how long an otherwise idle connection remains usable under observed conditions.

The required heartbeat target is approximately **70â€“85% of the learned timeout, with jitter**.

This range is an assessment requirement. It is not presented here as a universally proven optimum for Android networks.

Jitter means deliberately varying heartbeat timing within a defined range so that clients do not all send their heartbeats at the same instant.

The implementation must define:

- How the timeout estimate is obtained.
- How successful and failed observations affect that estimate.
- How the estimate is bounded to avoid extreme values.
- How heartbeat timing is calculated.
- How jitter is applied.
- What happens when there is insufficient data to make a useful estimate.
- How the estimate changes when network conditions change.

### 4.4 Reconnection behavior

When a connection fails, immediately retrying in a tight loop can waste battery, increase server load, and repeatedly fail under the same network conditions.

The proposed strategy is bounded exponential backoff with jitter.

In simple terms, the connection manager waits before retrying, increases the waiting period after repeated failures, applies limits, and varies the delay to avoid synchronized retries.

The design should also account for available network information. A known transition from offline to online may justify attempting recovery sooner than repeatedly retrying while the device remains offline.

The application must not depend on network-type information alone as proof that the backend is reachable.

### 4.5 Wake locks and background execution

Official documentation:

https://developer.android.com/develop/background-work/background-tasks/awake/wakelock/

Android warns that wake locks can have substantial battery consequences and recommends avoiding them when possible and holding them only as briefly as necessary.

**Design implication:** Clockit should not hold a wake lock continuously merely to make its connection appear more reliable. Any wake lock must have a specific need, limited duration, and measurable justification.

Android's background-network guidance is also relevant:

https://developer.android.com/topic/performance/issues/bg-network-usage

### 4.6 Proposed balancing strategy

The connection manager should:

1. Track connection state and relevant heartbeat observations.
2. Maintain a bounded idle-timeout estimate when sufficient observations exist.
3. Schedule heartbeats according to the assessment's 70â€“85% target and apply jitter.
4. Detect and record connection failures without treating every temporary network disturbance as permanent.
5. Use bounded exponential reconnect delays with jitter.
6. Adjust recovery behavior when meaningful network-state changes are observed.
7. Avoid unnecessary background activity and long-running wake locks.
8. Measure delivery latency, failure-detection time, reconnect behavior, heartbeat volume, and battery impact.
9. Recover missing events through an explicitly defined mechanism rather than assuming reconnection restores everything automatically.

### 4.7 Comparison of balancing choices

| Strategy                                | Potential benefit                                                        | Main cost or risk                                             |
| --------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Very frequent heartbeat                 | May detect some failures sooner                                          | More network activity and possible battery cost               |
| Very infrequent heartbeat               | Lower heartbeat volume                                                   | Longer detection delay for some failures                      |
| Fixed heartbeat interval                | Simple to implement and reason about                                     | May not fit changing network behavior                         |
| Learned timeout with jitter             | Adapts scheduling to observed behavior and reduces synchronized activity | Requires a sound estimator, limits, and validation            |
| Immediate repeated reconnect            | May restore a connection quickly if a failure is brief                   | Can create retry storms and waste battery                     |
| Bounded exponential backoff with jitter | Reduces repeated retry pressure                                          | Can delay recovery if retry delays are excessive              |
| Continuous wake lock                    | May keep some work running in specific circumstances                     | Potentially substantial battery cost and platform constraints |

### 4.8 Verification plan

Measure the implementation under controlled scenarios:

- Stable connectivity over an extended period.
- Intermittent connectivity.
- Complete network loss and restoration.
- Connection interruption while the application is backgrounded.
- Repeated failed connection attempts.
- Application process termination and restart.
- Changes between available network types.
- Long idle periods and device power-management states.

Collect timestamps for connection loss, failure detection, reconnect attempts, reconnection success, event receipt, and event processing.

Measure battery consumption with appropriate Android profiling tools on identified devices. Record device model, operating-system version, test duration, network conditions, and application state so results can be compared fairly.

A simulation can validate state transitions and retry logic. It cannot establish real-device battery consumption or carrier-level delivery performance.

**Decision status:** Adaptive heartbeat and bounded reconnect strategy are proposed in accordance with the assessment requirements; effectiveness and battery impact remain unverified.

## 5. REQ-TRADE-003 â€” Direct Watch Connectivity Versus Phone Relay

### 5.1 Approach A: Phone as the primary relay

The backend sends events to the phone. The phone receives and processes them, then relays appropriate information to the smartwatch.

The phone is the primary backend-facing companion, while the watch remains the main notification and engagement surface.

This design places the backend connection manager and its recovery logic on the phone. It also introduces a dependency on the phone and the phone-to-watch communication path.

### 5.2 Approach B: Direct watch connectivity

A supported smartwatch communicates with backend services using its own available network connection.

This can reduce dependence on the phone being reachable for some watch-side operations. However, availability depends on the watch's hardware, network configuration, power state, and platform capabilities.

Direct connectivity also introduces watch-side networking, authentication, lifecycle, retry, battery, and security responsibilities.

### 5.3 Evidence from official Wear OS documentation

#### Wear OS Data Layer API

Official documentation:

https://developer.android.com/training/wearables/data/overview

The Wear OS Data Layer API supports communication between a paired Android phone and Wear OS watch. Depending on connectivity, transfers can use Bluetooth or Google-managed infrastructure.

The documentation distinguishes phone-watch communication from applications accessing their own backend services.

**Design implication:** The Data Layer is a relevant option for the phone-to-watch relay. It is not a replacement for Clockit's backend event source.

The documented behavior should not be generalized to every smartwatch platform or every phone-watch pairing.

#### Direct network communication

Official documentation:

https://developer.android.com/training/wearables/data/network-communication

Wear OS applications can communicate directly over a network. Depending on the device and connectivity, network traffic may be routed through a connected phone or use the watch's own Wi-Fi or cellular capability.

Network availability can be affected by battery-saving behavior, so obtaining a usable connection may not be instantaneous.

The documentation also identifies FCM as an option for sending notifications to Wear OS devices.

**Design implication:** Direct watch networking is technically possible on supported devices, but it does not establish that direct connectivity is more reliable, faster, or more battery-efficient for Clockit's target users.

### 5.4 Comparison

| Consideration        | Phone relay                                                         | Direct watch connectivity                                                         |
| -------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Backend connection   | Managed primarily by the phone                                      | Managed by the watch                                                              |
| Phone dependency     | Watch relay depends on the phone-side path                          | Some operations may continue without the phone if the watch has network access    |
| Latency              | Includes backend-to-phone and phone-to-watch delivery               | Depends on watch network availability and backend path                            |
| Network availability | Phone's backend connection and phone-watch path matter              | Watch hardware, network availability, and power state matter                      |
| Battery              | Phone manages backend streaming; watch receives relayed information | Watch may need additional networking and recovery activity                        |
| Complexity           | Centralizes backend connection management on the phone              | Adds watch-side backend networking, authentication, and recovery responsibilities |
| Recovery             | Must recover backend-to-phone and phone-to-watch delivery           | Must recover the watch's direct connection independently                          |
| Main risk            | Phone or relay-path failure can delay watch delivery                | Watch may lack usable connectivity or incur additional operational costs          |

### 5.5 Proposed Clockit direction

Keep the phone as the primary backend relay for the assessment's main architecture.

Use an appropriate phone-to-watch communication mechanism, such as the Wear OS Data Layer for supported Android-phone/Wear OS-watch configurations, subject to implementation verification.

Treat direct watch connectivity as an alternative to evaluate only if a clearly defined requirement justifies it. Do not silently change the primary architecture merely because Wear OS supports direct networking.

Before extending the design to direct watch connectivity, establish:

- Which watch platforms and models are in scope.
- Whether the watch has independent Wi-Fi or cellular connectivity.
- Whether the relevant watch operations must continue when the phone is unavailable.
- Whether the expected benefit justifies the extra implementation and recovery paths.
- How watch-side credentials and requests will be secured.
- How duplicate events and conflicting state will be handled.
- How battery and delivery behavior will be measured.

**Decision status:** Phone relay remains the proposed primary architecture. Direct watch connectivity is a conditional alternative, not a verified improvement.

## 6. Cross-cutting rule: Delivery is not transaction execution

These architecture decisions concern the movement of events and information. They must not collapse three different facts into one:

1. An event was sent or accepted for delivery.
2. A transaction intent was accepted for processing.
3. The transaction reached a confirmed outcome.

A successful socket write, push notification, phone-to-watch transfer, or watch acknowledgement does not by itself prove that a transaction was executed.

If a connection breaks after a request is sent, the result may be uncertain. Clockit must distinguish uncertainty from confirmed failure and must not automatically repeat a financial operation without appropriate duplicate protection and outcome-recovery logic.

This distinction must remain consistent with the backend transaction-processing and integrated-architecture designs.

## 7. Evidence gaps and verification requirements

The official documentation supports the platform-behavior descriptions in this document. The following Clockit-specific claims remain unproven:

- That a persistent foreground-service connection meets the required delivery latency.
- That the proposed FCM fallback behaves correctly under the target Android versions and application states.
- That the learned timeout produces useful heartbeat timing on real networks.
- That the 70â€“85% heartbeat target provides an acceptable balance of detection time and battery use.
- That the reconnect policy recovers quickly without excessive retries.
- That the phone-to-watch relay meets the required delivery and recovery behavior.
- That the chosen design performs acceptably across the actual target devices and carriers.
- That missed or duplicated events are recovered and handled correctly.
- That a direct watch connection would provide sufficient additional value to justify its complexity.

Until tests establish these points, they must be reported as unknown or unverified rather than as demonstrated system behavior.

## 8. Verification plan

### Stage 1: Verify behavior without relying on physical-device claims

Use unit and integration tests to check:

- Connection state transitions.
- Heartbeat scheduling and timeout-estimator bounds.
- Exponential backoff and jitter.
- Reconnection after simulated network interruption.
- Duplicate and out-of-order event handling.
- Push-message handling and recovery paths.
- Phone-to-watch relay behavior and failure handling.
- Separation between delivery acknowledgement and transaction outcome.

Record which tests use mocks, simulations, or controlled integration environments.

### Stage 2: Verify Android platform behavior

Test on identified Android versions and representative phones:

- Foreground-service startup and lifecycle restrictions.
- Push handling under foreground and background conditions.
- Doze and idle-device behavior.
- Connection loss and restoration.
- Application process termination and restart.
- Battery use during idle, streaming, and reconnection.

Document the device model, operating-system version, settings, test duration, and observed results.

### Stage 3: Verify phone-to-watch behavior

On identified, supported phone-watch combinations, test:

- Successful relay.
- Phone-to-watch disconnection.
- Watch disconnection and restoration.
- Phone unavailability.
- Delayed, duplicated, and out-of-order events where the test environment can reproduce them.
- Whether the watch displays an event before, during, or after backend state changes.
- Recovery without confusing notification receipt with transaction execution.

### Stage 4: Evaluate alternatives using measurements

Compare the persistent connection, FCM-assisted behavior, and phone relay against the same defined scenarios.

Where a direct watch connection is considered, compare it using the same event definitions, test duration, device conditions, and success criteria.

Do not declare a winner without comparable measurements.

## 9. Source register

**S1 â€” Android: Restrictions on starting foreground services from the background**

https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start

Supports discussion of background-start restrictions, exemptions, and related Android requirements.

**S2 â€” Firebase: Set and manage Android message priority**

https://firebase.google.com/docs/cloud-messaging/android-message-priority

Supports discussion of normal versus high-priority messages, Doze behavior, processing limits, and user-visible notification expectations.

**S3 â€” Android: Optimize for Doze and App Standby**

https://developer.android.com/training/monitoring-device-state/doze-standby

Supports discussion of idle-state restrictions, deferred work, and downstream messaging.

**S4 â€” Android: Optimize network access**

https://developer.android.com/topic/performance/issues/bg-network-usage

Supports discussion of background network activity and energy consumption.

**S5 â€” Android: Wake locks**

https://developer.android.com/develop/background-work/background-tasks/awake/wakelock/

Supports guidance to avoid unnecessary wake locks and minimize their duration.

**S6 â€” Android: Data Layer API overview**

https://developer.android.com/training/wearables/data/overview

Supports discussion of phone-to-watch communication and the distinction between device-to-device communication and backend access.

**S7 â€” Android: Network communication on Wear OS**

https://developer.android.com/training/wearables/data/network-communication

Supports discussion of direct watch networking, available network paths, and connectivity limitations.

## 10. Conclusion

The proposed Clockit architecture keeps the phone as the primary backend-facing connection manager and watch relay. It uses adaptive heartbeat scheduling and bounded reconnect behavior to manage connection failures, while treating FCM as a complementary delivery mechanism rather than an unconditional replacement for streaming.

This direction is consistent with the stated assessment requirements and documented Android and Wear OS platform behavior.

It is not yet a verified performance result. Implementation, reproducible tests, and real-device measurements are required before claiming that the architecture achieves its intended reliability, latency, or battery targets.
