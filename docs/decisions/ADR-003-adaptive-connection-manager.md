# ADR-003: Adaptive Phone Connection Manager

**Project:** Clockit — Real-Time Event-to-Transaction Streaming Infrastructure
**Stage:** 3 — Adaptive Phone Connection Manager
**Status:** Proposed
**Date:** 28 October 2026

## 1. Context

The connection manager is responsible for maintaining the phone's backend connection, detecting suspected connection failures, adapting heartbeat timing, reconnecting safely, and preserving pending outbound work.

The research and design documents establish the required behavior and identify constraints from WebSocket liveness, Android network changes, Doze, foreground-service restrictions, and push messaging.

The assessment requires adaptive timeout learning, heartbeat scheduling at approximately 70–85% of the learned idle timeout, jitter, bounded exponential reconnection backoff, pending-work recovery, lifecycle callbacks, metrics, and a reproducible test harness.

The design must distinguish observed behavior from inferred causes. A successful heartbeat establishes responsiveness at that moment, while a missed response indicates suspected failure rather than proving that a carrier NAT mapping expired.

The initial implementation is intended to make the connection-management behavior reproducible through a simulated transport. Real Android execution, physical Bluetooth communication, carrier-network behavior, and production-scale reliability remain outside the evidence established by the design.

## 2. Decision

Adopt the following proposed architectural direction for the adaptive connection manager:

1. Implement the connection manager in TypeScript, with one component responsible for connection state, heartbeat scheduling, failure detection, and reconnection decisions.
2. Begin with a simulated connection transport and deterministic test controls for time, scheduling, randomness, and connection outcomes.
3. Maintain an explicit connection state machine that distinguishes connecting, connected, suspected failure, waiting to reconnect, disconnected, and stopped states.
4. Use an evidence-based timeout estimator. Apply an exponential moving average (EMA) only to qualified numeric timeout samples; keep successful lower-bound observations and ambiguous failures separate from confirmed timeout samples.
5. Keep the learned timeout unknown until a qualified sample exists. Use a separately configured fallback heartbeat policy when the estimate is unavailable.
6. When a valid learned estimate exists, select heartbeat intervals within the required 70–85% range, with injectable jitter for reproducible testing.
7. Use a configurable heartbeat response deadline and treat a missed deadline as suspected connection failure, not proof of a specific root cause.
8. Use bounded exponential backoff with jitter for reconnection. Keep network availability, backend connection health, and BLE liveness as separate observations.
9. Preserve pending outbound items across connection interruptions, retain stable identifiers across retries, and remove or acknowledge items only when their defined acknowledgment contract is satisfied.
10. Make the outbox storage strategy explicit. Do not claim recovery across process death unless the selected persistence mechanism and its recovery behavior are verified.
11. Expose the required lifecycle callbacks and metrics, including learned timeout, consecutive failures, and last heartbeat round-trip time.
12. Simulate foreground-service protection through an adapter or interface. Do not represent this simulation as actual Android foreground-service integration or a guarantee of process survival.
13. Keep backend transaction idempotency as a separate requirement. Retrying a transaction intent must preserve its identifier, but client-side behavior alone cannot guarantee single transaction execution.
14. Treat automated tests and demonstration results as the evidence for the initial implementation. Do not claim real-device, carrier-network, OEM-specific, or production-scale verification without corresponding tests.

This decision establishes the component's proposed behavior and boundaries. It does not establish empirically optimal timeout values, retry parameters, or production reliability.

## 3. Rationale

### 3.1 One owner for connection decisions

A single component coordinating connection state and scheduling prevents competing heartbeat loops, overlapping reconnect attempts, and inconsistent decisions by other components.

### 3.2 Evidence-based timeout learning

Connection failures can result from network interruption, application suspension, remote endpoint failure, or other causes. Treating every failure as a confirmed idle timeout would contaminate the estimate and could produce inappropriate heartbeat intervals.

### 3.3 Deterministic testing

Injectable time, scheduling, randomness, and transport behavior allow tests to reproduce failure sequences without waiting for real network timeouts or relying on uncontrolled random values.

### 3.4 Explicit recovery and acknowledgment

A connection interruption does not mean pending work has been completed or safely received. Stable identifiers, defined acknowledgment rules, and retained pending state allow the manager to retry work without silently discarding it.

### 3.5 Honest platform boundaries

Android network callbacks, WebSocket heartbeats, simulated execution protection, and BLE observations provide different kinds of evidence. Treating them as interchangeable would create false confidence about backend liveness or process survival.

## 4. Alternatives considered

### 4.1 Fixed heartbeat interval

**Not selected as the complete policy.**

A fixed interval is simpler to implement and can serve as a fallback when no reliable estimate exists. It does not satisfy the adaptive timeout-learning requirement on its own.

### 4.2 Adaptive heartbeat scheduling using qualified timeout evidence

**Preferred architectural direction.**

This supports the required relationship between learned timeout and heartbeat timing while distinguishing measured estimates from fallback configuration. It requires explicit sample qualification and testing to prevent misleading estimates.

### 4.3 Treat every disconnection as a timeout sample

**Rejected.**

A disconnection does not uniquely identify carrier NAT expiry. Using ambiguous failures as confirmed timeout samples would conflate different failure causes.

### 4.4 Immediate or fixed-delay reconnection

**Not selected as the complete policy.**

A simple retry can be useful in a demonstration, but an unbounded or synchronized retry pattern can create unnecessary load during widespread outages. The proposed design uses bounded exponential backoff with jitter.

### 4.5 In-memory outbox

**Permitted for a limited initial demonstration.**

It can demonstrate pending-item retention and retry behavior while the process remains alive. It cannot demonstrate recovery after process termination destroys memory.

### 4.6 Persistent outbox

**Retained as an option requiring an explicit implementation decision.**

Persistent storage is necessary when pending items must survive process death. Its transaction, retention, acknowledgment, and recovery behavior must be selected and verified before claiming process-restart recovery.

### 4.7 Real Android integration in the initial component

**Deferred.**

The current design establishes a TypeScript component with simulated transport and execution-protection behavior. Actual Android service integration, physical BLE communication, and OEM-specific behavior require separate implementation and verification.

## 5. Required behavioral contracts

### 5.1 Connection state

The implementation must define valid state transitions and prevent competing connection attempts. A transport connection does not prove that the connection will remain usable.

Stopping the manager must cancel the scheduled work it owns without silently deleting pending outbox items.

### 5.2 Timeout observations

Every candidate timeout observation must retain its relevant interval, outcome, observation source, and known confounding conditions.

A successful heartbeat after an idle interval is a lower-bound observation. An unexplained failure is ambiguous. Neither should automatically be treated as a confirmed maximum idle timeout.

The implementation must expose whether the learned estimate is unknown or has been updated from qualified samples.

### 5.3 Heartbeats

The manager must maintain at most one active heartbeat schedule and prevent overlapping heartbeat operations unless a separately defined protocol explicitly permits them.

Each heartbeat must have a send time, response deadline, and observable outcome. Round-trip time must be recorded when a valid response is received.

Changing the learned estimate must not leave obsolete heartbeat timers capable of initiating additional operations.

### 5.4 Reconnection

The reconnection policy must define its initial delay, growth rule, maximum delay, jitter strategy, retry counter, and reset condition.

A known network outage must not cause continuous reconnect attempts. Network restoration may trigger recovery, but backend connection usability must still be confirmed independently.

After reconnection, pending work must be reconciled and eligible items retried with their original identifiers.

### 5.5 Outbox and transaction intents

Each pending item must retain a stable identifier, item type, creation time, delivery state, and sufficient attempt and acknowledgment information for recovery and diagnosis.

A socket write alone does not satisfy an acknowledgment contract requiring remote durable storage.

Transaction-intent retries must preserve the idempotency identifier expected by the backend. Final transaction execution and outcome remain outside this component's responsibility.

### 5.6 Network and BLE observations

Network callbacks may inform recovery decisions but do not prove backend connection health.

BLE activity must not update the learned idle timeout for the phone-to-backend connection or mark that connection healthy.

### 5.7 Lifecycle events and metrics

The implementation must expose the lifecycle events defined in the design, including connection changes, received events, queued intents, acknowledgment and failure events, reconnection progress, heartbeat timeouts, and recovery completion.

At minimum, metrics must expose the learned timeout, consecutive connection failures, and last heartbeat round-trip time. Unknown measurements must remain distinguishable from measured zero values.

## 6. Consequences

### Positive consequences

- Connection state and recovery decisions have a single owner.
- Timeout estimates can be traced to qualified observations.
- Heartbeat and reconnect behavior can be tested reproducibly.
- Pending work is treated separately from connection status.
- Stable identifiers support duplicate-safe retries when the receiving system enforces the appropriate contract.
- Network state, backend liveness, and BLE liveness remain distinct.
- Metrics and lifecycle events provide evidence for diagnosing connection failures.

### Costs and limitations

- The state machine and estimator require explicit transition and sample-qualification rules.
- Injectable scheduling and transport abstractions add design and implementation work.
- A simulated transport cannot establish real WebSocket or carrier-network behavior.
- An in-memory outbox cannot prove recovery across process death.
- A foreground-service simulation cannot establish Android process survival.
- Transaction safety depends on backend idempotency and transaction-outcome handling outside this component.
- Physical-device, OEM-specific, and 500,000-user scale claims remain unverified until tested in appropriate environments.

## 7. Verification required

Before the component can be considered verified, tests must demonstrate:

- Successful connection establishment and valid state transitions.
- Correct handling of qualified timeout samples, lower-bound observations, ambiguous failures, and confounded observations.
- Correct heartbeat interval selection when a learned estimate exists.
- Use of the configured fallback policy when the estimate is unknown.
- Correct heartbeat response deadlines and suspected-failure handling.
- Bounded exponential reconnection backoff with reproducible jitter.
- Correct behavior during network loss, restoration, and changes during active operations.
- Retention and retry of unacknowledged items with stable identifiers.
- Correct handling of repeated and delayed acknowledgments.
- Cancellation of owned timers and reconnect tasks when stopped.
- Foreground-service simulation behavior without claiming real platform protection.
- Separation of BLE liveness from backend connection health.
- Recovery behavior consistent with the selected outbox persistence strategy.
- Reproducible test results that distinguish simulated evidence from physical-device or network evidence.

No test is considered passed merely because it is listed in this decision record.

## 8. Unresolved decisions

The following remain open until justified by implementation constraints and appropriate evidence:

1. The EMA coefficient and exact rules for accepting timeout samples.
2. The initial fallback heartbeat interval and its operational limits.
3. The heartbeat response deadline.
4. The reconnection initial delay, maximum delay, jitter distribution, and retry-reset conditions.
5. The mapping from available network-quality observations to retry behavior.
6. The outbox persistence mechanism for the initial implementation.
7. The acknowledgment contract for each outbound item type.
8. The retention and terminal-failure policy for pending items.
9. The precise scope of process-restart recovery in the demonstration.
10. The criteria for replacing simulated transport with a real WebSocket implementation.
11. The scope and environment required for physical Android, BLE, carrier-network, and OEM-specific verification.

These decisions must be documented and tested where appropriate. No setting should be described as empirically optimal without supporting evidence.

## 9. References

- IETF, [RFC 6455 — The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455)
- Android Developers, [ConnectivityManager.NetworkCallback](https://developer.android.com/reference/android/net/ConnectivityManager.NetworkCallback)
- Android Developers, [Read network state](https://developer.android.com/develop/connectivity/network-ops/reading-network-state)
- Android Developers, [Optimize for Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)
- Android Developers, [Services overview](https://developer.android.com/develop/background-work/services)
- Android Developers, [Restrictions on starting a foreground service from the background](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)
- Android Developers, [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types)
- Firebase, [Set and manage Android message priority](https://firebase.google.com/docs/cloud-messaging/android-message-priority)

This decision record is based on `docs/research/connection-manager-research.md` and `docs/design/adaptive-connection-manager.md`. It records a proposed architectural direction, not implementation or verification evidence.
