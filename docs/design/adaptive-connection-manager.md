# Adaptive Connection Manager — Design

## 1. Purpose

Define the design for `AdaptiveConnectionManager`, the TypeScript component responsible for maintaining a simulated backend connection, detecting connection failures, adapting heartbeat timing, reconnecting safely, and preserving pending outbound work.

This design addresses requirements `REQ-CONN-001` through `REQ-CONN-011` and defines the planned verification scenarios.

The initial implementation will use a simulated connection so the core behavior can be tested reproducibly without requiring an Android device or a live backend.

## 2. Scope

### Included

- Connection lifecycle and state.
- Adaptive idle-timeout estimation.
- Heartbeat scheduling and response deadlines.
- Silent connection-failure detection.
- Network-quality-aware reconnection.
- Pending outbound events and transaction intents.
- Acknowledgment and retry behavior.
- Lifecycle callbacks and required metrics.
- Foreground-service protection simulation.
- Network-change and BLE-liveness interfaces where useful.
- Automated tests and a repeatable demonstration.

### Excluded from this component

- Backend event creation and publication.
- The backend event-delivery service.
- Actual Android foreground-service integration.
- Physical phone-to-watch Bluetooth communication.
- Watch user-interface implementation.
- Backend transaction execution and final transaction outcomes.

The manager will expose interfaces that support integration with these components without embedding their responsibilities inside the connection manager.

## 3. Design principles

1. **Connection state is not the same as network state.** An available network does not prove that the backend connection is working.
2. **A timeout estimate is evidence-based.** An unexplained disconnection must not automatically be classified as a carrier NAT timeout.
3. **Pending work is not discarded merely because the connection closes.**
4. **A retry does not authorize a second transaction execution.** Transaction idempotency must also be enforced by the backend.
5. **Time and randomness must be controllable in tests.** Tests must not depend on real waiting periods or unpredictable random outcomes.
6. **Simulation results are not physical-device results.** Verification records must distinguish simulated behavior from physical-device behavior.
7. **One component owns connection decisions.** Other components report observations and request work through defined interfaces rather than independently opening connections or scheduling competing heartbeats.

## 4. Component boundaries

The manager will coordinate these logical responsibilities:

- **Connection transport:** Opens, closes, and reports the status of the simulated or real connection.
- **Timeout estimator:** Maintains the current estimate and evaluates new observations.
- **Heartbeat scheduler:** Determines when to send the next heartbeat and when a response is overdue.
- **Reconnect controller:** Calculates retry delays and responds to network conditions.
- **Outbox:** Retains outbound items until their acknowledgment policy permits removal.
- **Lifecycle event publisher:** Reports connection changes, received events, queued intents, acknowledgments, failures, and recovery.
- **Metrics collector:** Exposes the current learned timeout, consecutive failures, and last heartbeat round-trip time.
- **Execution-protection adapter:** Simulates requests to protect or release persistent execution.

These are logical responsibilities, not a requirement to create a separate class for every item.

## 5. Connection state

The manager will maintain an explicit state representing its current knowledge of the connection.

| State               | Meaning                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `DISCONNECTED`      | No active connection is available.                                                       |
| `CONNECTING`        | A connection attempt is in progress.                                                     |
| `CONNECTED`         | The transport reports a connected session.                                               |
| `SUSPECTED_FAILURE` | A heartbeat or other liveness check has failed or exceeded its deadline.                 |
| `RECONNECT_WAIT`    | A retry is scheduled but has not started.                                                |
| `STOPPED`           | The manager has been explicitly stopped and should not initiate new connection attempts. |

The implementation must define valid state transitions and prevent concurrent connection attempts from creating competing sessions.

A successful transport connection moves the manager to `CONNECTED`, but subsequent heartbeat or transport failures can move it to `SUSPECTED_FAILURE`.

A network-change notification is an input to the state machine, not proof by itself that the backend connection has failed.

Stopping the manager cancels scheduled work that it owns. It must not silently delete pending outbox items.

## 6. Idle-timeout estimation

### 6.1 Purpose

The estimator maintains an estimate of the effective idle timeout based on qualified observations.

A successful heartbeat after an idle interval establishes that the connection survived at least that interval under the observed conditions. It does not establish the maximum safe idle period.

A failed heartbeat does not, by itself, establish that a carrier NAT mapping expired. Network changes, application suspension, remote endpoint failures, and other causes can produce similar symptoms.

The estimator must distinguish confirmed timeout observations from lower-bound observations and ambiguous failures.

### 6.2 Estimator

For qualified numeric timeout samples, the implementation will use an exponential moving average (EMA):

`newEstimate = α × newSample + (1 − α) × previousEstimate`

Where:

- `newEstimate` is the updated estimate.
- `newSample` is a qualified timeout observation.
- `previousEstimate` is the previous estimate.
- `α` determines how strongly a new sample influences the estimate.

The value of `α` must be configurable and documented before implementation. No value will be presented as empirically optimal without supporting measurements.

If no qualified sample exists, the timeout estimate remains unknown. The heartbeat scheduler must use a separate, explicitly configured fallback interval until sufficient evidence is available.

The implementation must distinguish the fallback interval from the learned estimate.

### 6.3 Sample qualification

Each candidate observation must record, where available:

- The elapsed idle interval.
- The time of the last successful communication.
- The heartbeat send time and response outcome.
- Whether the application was actively executing.
- Any network transition during the observation.
- Whether the transport identified a specific failure cause.
- Whether the observation was accepted, rejected, or classified as a lower bound.
- The reason for that classification.

The estimator applies the following rules:

| Observation                                                                                              | Classification                        | Estimator action                                                         |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| A heartbeat succeeds after an idle interval                                                              | Lower-bound observation               | Record the interval; do not treat it as the maximum timeout sample.      |
| A heartbeat fails and the cause is unknown                                                               | Ambiguous failure                     | Do not update the estimate. Begin connection-failure handling.           |
| A network transition or application suspension affects the observation                                   | Confounded observation                | Exclude it from timeout estimation.                                      |
| A controlled simulation confirms idle expiration at a known configured threshold                         | Qualified simulation sample           | Use the known simulated timeout as a sample for the simulated estimator. |
| A real transport provides independently verifiable evidence of idle expiration and the relevant interval | Potential qualified real-world sample | Accept only when the evidence and qualification rule are documented.     |

The simulated transport must expose the configured idle-expiration threshold and identify when expiration occurs because of that threshold. The test harness must distinguish this controlled result from an unexplained connection failure.

A successful heartbeat must not be converted into an estimated maximum timeout. An unexplained failure must not be converted into a timeout sample merely because it occurred after a particular interval.

### 6.4 Initial estimate and confidence

Before any qualified samples exist, the estimate is unknown. The heartbeat fallback is a configuration value, not a measurement.

The implementation must expose whether the estimate is unknown or has been updated from qualified samples. It must not report an unmeasured value as learned.

The EMA smooths qualified numeric samples; it does not resolve uncertainty about their cause. The estimator's behavior must be tested using qualified simulated samples, successful lower-bound observations, and ambiguous failures.

### 6.5 Limits of the evidence

A controlled simulation can verify that the estimator processes known simulated timeout samples correctly. It cannot establish a mobile carrier's actual NAT timeout.

Real-world timeout behavior remains unverified until it is measured under controlled conditions with sufficient evidence to distinguish idle expiration from other failure causes.

## 7. Adaptive heartbeats

### 7.1 Interval selection

The assessment requires application-level heartbeats at approximately 70–85% of the learned idle timeout, with jitter.

For a valid learned estimate, the initial policy will select a randomized interval within the 70–85% range. The random-number source must be injectable so tests can reproduce exact schedules.

The implementation must record the selected interval and the estimate used to calculate it.

If the estimate is missing or unreliable, the manager must use an explicit configurable fallback policy. It must not treat an unmeasured initial value as a learned estimate.

### 7.2 Rescheduling

When the learned estimate changes, the manager must recalculate the next heartbeat schedule.

The design must prevent multiple active heartbeat timers from accumulating. Only the current schedule should be allowed to initiate a heartbeat.

The implementation must also define how an already-sent heartbeat is handled if the schedule changes before its response arrives.

### 7.3 Response deadline

Each heartbeat has a send time and a response deadline.

When a valid response arrives, the manager records the round-trip time and updates the last successful heartbeat information.

When the response deadline expires, the manager records a heartbeat timeout and enters the failure-detection process.

The response deadline must be configurable and tested. It must not be confused with the learned idle timeout: one is a deadline for an expected response, while the other is an estimate of how long the connection tolerates inactivity.

A heartbeat timeout indicates suspected failure. It does not establish the precise underlying cause.

## 8. Reconnection policy

### 8.1 Exponential backoff with jitter

After a failed connection attempt, the manager calculates a retry delay using exponential backoff and jitter.

The policy must have:

- A configurable initial delay.
- An exponential growth rule.
- A configurable maximum delay.
- A jitter strategy.
- A defined retry counter.
- A documented reset condition after successful recovery.

The actual parameter values must be justified and tested before being treated as final.

Jitter reduces the likelihood that clients experiencing simultaneous failures will retry at the same instant. A maximum delay limits how far the retry interval can grow.

### 8.2 Network quality

The manager will receive network-condition observations through an interface rather than assuming a particular network-quality measurement is available.

The policy must distinguish at least:

- Network unavailable.
- Network available but backend connection not yet verified.
- Backend connection responsive.
- Backend connection failing or suspected to be stale.

If more detailed network-quality information is available, the design can use it to influence retry decisions. The exact mapping from network quality to retry behavior remains a configurable design decision.

The manager must not retry continuously while a known network outage persists.

### 8.3 Recovery

After reconnection, the manager must:

1. Confirm that the new transport session is usable.
2. Reset the relevant failure state according to the documented reset policy.
3. Reconcile pending outbound work with the acknowledgment records available to it.
4. Retry eligible pending items without changing their stable identifiers.
5. Emit a recovery event.
6. Resume heartbeat scheduling using the current timeout estimate.

A successful socket connection alone does not prove that all pending events have reached their destination.

## 9. Outbox and acknowledgment

### 9.1 Outbox item

Every outbound item must have a stable identifier that remains unchanged across retries.

The item should contain:

- Stable item identifier.
- Item type, such as event or transaction intent.
- Payload or payload reference.
- Creation time.
- Delivery status.
- Attempt count.
- Last attempt information, where useful.
- Acknowledgment information, when available.

### 9.2 Lifecycle

An item is queued before it is sent.

The manager attempts delivery while the connection is usable. A temporary connection failure leaves the item pending.

The item becomes acknowledged only when the acknowledgment contract for that item type is satisfied. A successful socket write is not sufficient evidence of remote durable storage.

An item may be marked failed after a documented terminal condition, but failure handling must not silently erase evidence of the item or its attempts.

### 9.3 Durability

The assessment permits an in-memory or durable outbox.

The initial implementation must explicitly identify which one it uses. An in-memory outbox can demonstrate retries during simulated connection interruptions, but it cannot demonstrate recovery after the process and its memory are lost.

Process-restart recovery requires persistent storage if pending items must survive the loss of process memory.

### 9.4 Duplicate protection

Retries must preserve the original item identifier.

The receiving system must use that stable identifier, or an equivalent idempotency key, to recognize duplicate requests.

For transaction intents, the backend must enforce idempotent transaction processing. Client-side retry logic alone cannot guarantee that a transaction executes only once.

The design does not claim exactly-once network delivery. It aims for retryable delivery with explicit acknowledgment and duplicate-safe processing.

## 10. Lifecycle events and metrics

The manager must expose events for:

- `connected`
- `disconnected`
- `eventReceived`
- `intentQueued`
- `outboundItemAcknowledged`
- `outboundItemFailed`
- `reconnectionStarted`
- `reconnectionSucceeded`
- `reconnectionFailed`
- `heartbeatTimedOut`
- `recoveryCompleted`

Event payloads should include the relevant stable identifiers, timestamps, and failure reasons when available.

At minimum, metrics must expose:

- Current learned idle timeout.
- Number of consecutive connection failures.
- Last heartbeat round-trip time.

Additional useful metrics include heartbeat timeouts, reconnect attempts, reconnect delay, outbox depth, oldest pending-item age, acknowledgment latency, and the number of accepted or rejected timeout samples.

Metrics must distinguish unknown values from zero. For example, an unavailable round-trip time must not be reported as a measured zero.

## 11. Foreground-service protection

The assessment requires methods to protect and unprotect a simulated foreground service.

The TypeScript implementation will expose an adapter or simulation that records whether execution protection was requested and whether that request was released.

Tests must verify that the manager requests protection at the intended lifecycle points and releases it when appropriate.

This simulation does not implement an Android foreground service and does not establish that Android or a device manufacturer will keep a real process running.

Actual Android service integration remains outside the scope of this component.

## 12. Network changes and BLE liveness

### 12.1 Network changes

The manager will accept network-change notifications through an interface.

It must reassess connection health when the network changes and avoid treating network availability as proof that the backend connection works.

Tests must cover loss of network, restoration of network, and a network change while a heartbeat or connection attempt is in progress.

### 12.2 BLE liveness

The manager may accept BLE-liveness observations as a separate input for future integration.

BLE activity must not update the learned idle timeout for the phone-to-backend connection. These are separate communication paths.

If BLE information influences delivery priority, that policy must be explicit and tested. BLE activity alone must not establish backend connectivity.

## 13. Testability and deterministic execution

The implementation must use injectable abstractions for:

- Clock and elapsed-time measurement.
- Scheduling and cancellation.
- Randomness.
- Connection transport.
- Network-condition observations.
- Outbox storage.
- Lifecycle event observation.
- Execution-protection simulation.

Tests must be able to advance time and produce connection failures without waiting for real network timeouts.

Elapsed-time calculations must use a monotonic time source so wall-clock changes do not distort timeout measurement or retry scheduling.

The test harness must report the scenario, expected result, observed result, and pass or fail outcome.

## 14. Required test scenarios

| Test ID      | Scenario                                           | Expected behavior                                                                    |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| ACM-TEST-001 | Connection opens successfully                      | State becomes connected and a lifecycle event is emitted.                            |
| ACM-TEST-002 | Qualified timeout sample arrives                   | The estimate updates according to the documented estimator.                          |
| ACM-TEST-003 | Ambiguous connection failure occurs                | The sample is not incorrectly treated as a confirmed NAT timeout.                    |
| ACM-TEST-004 | Heartbeat interval is calculated                   | The selected interval meets the configured 70–85% rule when a valid estimate exists. |
| ACM-TEST-005 | Heartbeat response arrives                         | RTT is recorded and liveness is updated.                                             |
| ACM-TEST-006 | Heartbeat response misses its deadline             | A timeout is recorded and recovery begins.                                           |
| ACM-TEST-007 | Connection repeatedly fails                        | Retry delays follow the configured bounded backoff and jitter policy.                |
| ACM-TEST-008 | Network becomes unavailable                        | Reconnect behavior respects the outage policy.                                       |
| ACM-TEST-009 | Network becomes available again                    | Recovery is attempted and confirmed before pending work is replayed.                 |
| ACM-TEST-010 | Outbound item is not acknowledged                  | The item remains pending and can be retried.                                         |
| ACM-TEST-011 | Acknowledgment arrives after a retry               | The item is not delivered indefinitely after successful acknowledgment.              |
| ACM-TEST-012 | Transaction intent is retried                      | The stable idempotency identifier is preserved.                                      |
| ACM-TEST-013 | Manager stops                                      | Owned timers and reconnect tasks are cancelled without deleting pending work.        |
| ACM-TEST-014 | Foreground-service protection is requested         | The simulation records the requested state and subsequent release.                   |
| ACM-TEST-015 | BLE reports activity while backend is disconnected | Backend liveness is not marked healthy because of BLE activity.                      |
| ACM-TEST-016 | Process-restart scenario is exercised              | The observed recovery behavior matches the selected outbox persistence strategy.     |

These are planned tests. None is considered passed until the implementation has been executed and the result recorded.

## 15. Open decisions

The following decisions must be resolved before or during implementation:

1. Initial heartbeat fallback when no reliable timeout estimate exists.
2. EMA coefficient and accepted timeout-sample rules.
3. Heartbeat response deadline.
4. Reconnection delay limits and jitter distribution.
5. How network quality influences retry scheduling.
6. Whether the initial outbox is in-memory or persistent.
7. The acknowledgment contract for each outbound item type.
8. The terminal-failure and retention policy for pending items.
9. Whether the initial implementation uses a real WebSocket library or a simulated transport.
10. The precise scope of the demonstration for process-death recovery.

These decisions must be documented with their rationale and verified by tests where applicable. They must not be described as empirically optimal without evidence.

## 16. Traceability

| Requirement  | Design sections                             |
| ------------ | ------------------------------------------- |
| REQ-CONN-001 | TypeScript implementation target; Section 1 |
| REQ-CONN-002 | Sections 2, 4, 5                            |
| REQ-CONN-003 | Section 6                                   |
| REQ-CONN-004 | Section 7                                   |
| REQ-CONN-005 | Section 8                                   |
| REQ-CONN-006 | Section 9                                   |
| REQ-CONN-007 | Section 10                                  |
| REQ-CONN-008 | Section 11                                  |
| REQ-CONN-009 | Section 10                                  |
| REQ-CONN-010 | Section 12                                  |
| REQ-CONN-011 | Sections 13 and 14                          |
| REQ-TEST-001 | Sections 8, 12, 14                          |
| REQ-TEST-002 | Sections 9, 14                              |
| REQ-TEST-005 | Sections 13 and 14                          |
| REQ-TEST-006 | Section 14                                  |
| REQ-TEST-007 | Sections 13 and 14                          |

This design covers connection management and its directly associated recovery behavior. End-to-end transaction-intent delivery and physical phone-to-watch communication require integration with the corresponding system components and separate system-level verification.

## 17. Verification status

- Design documented: This document.
- TypeScript implementation: Not yet implemented.
- Automated tests: Not yet executed.
- Real WebSocket behavior: Not yet verified.
- Physical Android behavior: Not yet verified.
- Carrier NAT timeout behavior: Not yet verified.
- OEM-specific background restrictions: Not yet verified.
- Production-scale behavior: Not yet verified.
