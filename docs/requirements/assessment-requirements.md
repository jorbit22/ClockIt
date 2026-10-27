# Clockit — Real-time Event-to-Transaction Streaming Infrastructure

## 1. Overview

This document defines the requirements for the Clockit technical assessment, **Real-time Event-to-Transaction Streaming Infrastructure**.

The project covers the design and implementation of adaptive connection management, reliable event delivery, Wear OS integration, transaction-intent handling, failure diagnosis, and system scalability.

## 2. Architecture and System Design

### REQ-ARCH-001 — System Architecture

Produce an architecture diagram showing the system components, their responsibilities, and the communication paths between them.

### REQ-ARCH-002 — Phone Connection Manager

Design the phone connection manager to address:

- Learning effective network idle timeouts.
- Heartbeat scheduling and connection-liveness detection.
- Reconnection after silent connection failures.
- Connection resumption and event replay.
- Android foreground-service and companion-device APIs.
- Bluetooth Low Energy (BLE) communication and liveness considerations.

### REQ-ARCH-003 — End-to-End Event-to-Transaction Flow

Document the complete flow from an incoming backend event to the Wear OS device, the user's double-tap action, and backend transaction processing.

Include the effects of:

- Phone process death or freezing.
- Network interruptions and connection loss.
- Interrupted event delivery or transaction-intent processing.

Describe the recovery behavior and how transaction outcomes are communicated to the user.

### REQ-ARCH-004 — African Mobile Network Failure Modes

Identify the five most important African mobile-network failure modes relevant to the system.

Explain their effects on connectivity, event delivery, transaction-intent handling, and recovery, together with appropriate mitigation strategies.

## 3. AdaptiveConnectionManager Implementation

### REQ-CONN-001 — Implementation Language

Implement `AdaptiveConnectionManager` in Kotlin preferably. Swift, TypeScript, or Go are acceptable alternatives.

### REQ-CONN-002 — Connection Maintenance

Maintain a WebSocket connection or a simulated connection suitable for demonstrating the required behavior.

### REQ-CONN-003 — Adaptive Idle-Timeout Learning

Learn the effective connection idle timeout using an exponential moving average (EMA).

The implementation must maintain and update the learned timeout from relevant observations.

### REQ-CONN-004 — Adaptive Heartbeats

Schedule heartbeats at 70–85% of the learned idle timeout, incorporating jitter.

The heartbeat strategy must adapt to the learned timeout.

### REQ-CONN-005 — Quality-Aware Reconnection

Implement reconnection using exponential backoff and jitter, taking connection quality into account.

### REQ-CONN-006 — Outbox

Implement a persistent or in-memory outbox for pending work.

The implementation must define how pending items are retained, retried, and handled during connection interruptions.

### REQ-CONN-007 — Callbacks

Provide callbacks for relevant connection and lifecycle events.

### REQ-CONN-008 — Foreground-Service Protection

Implement the required mechanism to protect and unprotect the simulated foreground service.

### REQ-CONN-009 — Connection Metrics

Expose the following metrics:

- Learned idle timeout.
- Number of consecutive connection failures.
- Last heartbeat round-trip time (RTT).

### REQ-CONN-010 — Bonus Capabilities

Investigate and, where feasible, implement:

- Network-change detection.
- NAT connection flushing or recovery.
- BLE-based liveness detection.

### REQ-CONN-011 — Test and Demonstration Harness

Provide a test or demonstration harness that exercises the connection manager and its recovery behavior.

## 4. Diagnosis of Reported Production Failures

### REQ-DIAG-001 — Silent Connection Failure

**Observed behavior:** Heartbeats succeed for two to three minutes before the connection silently dies.

Investigate the failure mechanisms, identify the diagnostic information needed to distinguish possible causes, and propose corrective measures.

### REQ-DIAG-002 — Delayed Events After Process Death

**Observed behavior:** Events are delayed by four to fifteen minutes after the phone process dies.

Investigate event delivery, process lifecycle behavior, recovery mechanisms, and the causes of the observed delays.

Propose changes that improve timely delivery and recovery.

### REQ-DIAG-003 — Slow Double-Tap Intent Delivery

**Observed behavior:** Double-tap intents take more than eight seconds to reach the backend.

Investigate the complete intent-delivery path, identify latency bottlenecks, and propose measurable improvements.

### REQ-DIAG-004 — Foreground Notification with a Frozen Application

**Observed behavior:** Some Transsion devices display a foreground-service notification while the application becomes frozen after approximately one minute.

Investigate Android background restrictions and manufacturer-specific behavior.

Explain the difference between a visible foreground-service notification and an application that is actively executing and maintaining network communication.

Propose corrective measures and ways to verify their effectiveness.

### REQ-DIAG-005 — Diagnostic Evidence and Corrective Actions

For each reported failure, provide:

- Observed symptoms.
- Relevant diagnostic data and measurements.
- Analysis of likely causes.
- Proposed corrective actions.
- Verification tests and their results.

## 5. Engineering Trade-offs

### REQ-TRADE-001 — Foreground Service Versus Push Delivery

Compare foreground-service-based persistent connectivity with Firebase Cloud Messaging (FCM) and watch push-delivery options.

Explain the reliability, latency, lifecycle, platform, and operational trade-offs.

### REQ-TRADE-002 — Battery Consumption Versus Reliability

Explain how heartbeat frequency and reconnection behavior affect battery consumption and connection reliability.

Describe the strategy for balancing these competing requirements.

### REQ-TRADE-003 — Direct Watch Connectivity Versus Phone Relay

Evaluate whether the watch should communicate directly with the backend or relay communication through the phone.

Compare the approaches in terms of reliability, latency, connectivity, battery consumption, complexity, and recovery behavior.

## 6. Scalability

### REQ-SCALE-001 — 500,000 Concurrent Users

Describe how the system can evolve to support 500,000 concurrent users across 2G, 3G, and 4G networks and devices with different manufacturer-specific restrictions.

Address:

- Connection and session management.
- Backend resource consumption.
- Heartbeat traffic.
- Reconnection storms.
- Event delivery and recovery.
- Capacity planning and bottleneck identification.
- Monitoring and operational reliability.

## 7. Testing and Verification

### REQ-TEST-001 — Connection Failure and Recovery

Test the connection manager under relevant failure conditions, including silent connection loss, network interruption, reconnection, and phone-watch disconnection.

### REQ-TEST-002 — Process Death and Event Recovery

Test event behavior when the phone process is killed or interrupted, including the resulting delivery and recovery behavior.

### REQ-TEST-003 — Transaction-Intent Handling

Test the complete path from a double-tap action on the watch to backend processing and the return of the transaction outcome.

Verify how interrupted requests, retries, and repeated delivery are handled.

Distinguish successful request delivery from successful transaction execution.

### REQ-TEST-004 — Diagnostic Scenario Reproduction

Reproduce the reported failure scenarios where feasible and record the observed behavior before and after corrective changes.

### REQ-TEST-005 — Automated Tests

Provide automated tests for the connection manager's required behaviors, including adaptive heartbeat scheduling, timeout learning, reconnection, and outbox handling.

### REQ-TEST-006 — Demonstration

Provide a reproducible demonstration of the implementation and its principal behaviors.

### REQ-TEST-007 — Test Evidence

Record the test procedures, execution environment, expected results, observed results, failures, and corrective changes.

## 8. Requirement Traceability

Each requirement ID connects the assessment requirement to its design, implementation, and verification evidence.

| Requirement Group | Scope                                      | Verification Evidence                            |
| ----------------- | ------------------------------------------ | ------------------------------------------------ |
| REQ-ARCH          | Architecture and event-to-transaction flow | Architecture diagram and design documentation    |
| REQ-CONN          | AdaptiveConnectionManager                  | Source code, automated tests, and demonstration  |
| REQ-DIAG          | Production failure diagnosis               | Diagnostic analysis and verification results     |
| REQ-TRADE         | Engineering trade-offs                     | Technical comparison and design rationale        |
| REQ-SCALE         | 500,000 concurrent users                   | Scalability analysis and supporting measurements |
| REQ-TEST          | Testing and demonstration                  | Test results and reproduction instructions       |

## 9. Verification Status

The status of each requirement is tracked as follows:

- **Not started:** Work has not begun.
- **In progress:** Research, design, implementation, or testing is underway.
- **Verified:** The requirement's acceptance criteria have been met and supporting evidence is available.
- **Blocked:** A technical issue or dependency prevents progress.

Requirements are marked verified based on test results, implementation evidence, or other applicable verification methods.
