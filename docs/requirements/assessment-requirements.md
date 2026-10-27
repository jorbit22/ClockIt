# Clockit: Real-Time Event-to-Transaction Streaming Infrastructure

## 1. Purpose and Scope

This document defines the requirements for the Clockit Senior Software Engineer technical assessment, **Real-Time Event-to-Transaction Streaming Infrastructure**.

The solution covers the delivery of time-sensitive backend events to a smartwatch through an Android phone companion, the capture and transmission of user intent, reliable transaction processing, and communication of the final transaction outcome. It also covers adaptive connection management, resilience under mobile-network and Android operating-system constraints, diagnosis of reported production failures, and scalability.

The assessment deadline is Thursday, October 29, 2026, at 12:00 PM WAT.

## 2. System Architecture and End-to-End Flow

### REQ-ARCH-001 — High-Level Architecture

Provide a high-level architecture diagram showing the system components, their responsibilities, and the communication paths between them. The diagram shall include:

- Backend event sources.
- The phone companion application, including its connection manager and event relay.
- The smartwatch engagement layer.
- The Bluetooth Low Energy (BLE) channel between phone and watch.
- The transaction execution path.
- The path by which transaction outcomes are communicated to the user.

### REQ-ARCH-002 — Backend Event Source and Event Handoff

Identify the backend component or service responsible for creating a time-sensitive event and show how that event is handed off to the delivery system.

Document the event's triggering condition, the information required to represent it, and the publishing or handoff mechanism used by the design. Define how event acceptance is acknowledged and how failures at the source-to-delivery boundary are handled.

The assessment gives “Flash sale – 12 units left” and “Stop-loss triggered” as examples of time-critical events. These are illustrative examples, not a specification of Clockit's business domain.

### REQ-ARCH-003 — Phone Connection Manager

Design the phone connection manager to address:

- Learning the effective idle timeout of network connections.
- Heartbeat scheduling and connection-liveness detection.
- Reconnection after silent connection failures.
- Connection resumption and event replay.
- Integration with Android foreground-service and companion-device APIs.
- Interaction with the phone-to-watch BLE link.

### REQ-ARCH-004 — End-to-End Event-to-Transaction Flow

Document the complete flow from creation of a backend event through delivery to the watch, capture of the user's double-tap action, backend transaction processing, and communication of the transaction outcome.

Describe the responsibilities and information exchanged at each stage. Address:

- Phone process death or freezing.
- Network interruptions and connection loss.
- Interrupted event delivery.
- Interrupted transaction-intent processing.
- Duplicate delivery and safe retries.
- Transaction outcomes that are completed but not successfully communicated to the user.

Distinguish successful delivery of a request from successful execution of the transaction.

### REQ-ARCH-005 — African Mobile-Network Failure Modes

Identify the five most important mobile-network failure modes relevant to the target operating environments.

For each failure mode, explain its effect on connectivity, event delivery, transaction-intent handling, or recovery, and describe the mitigation provided by the design.

## 3. AdaptiveConnectionManager Implementation

### REQ-CONN-001 — Implementation Language

Implement `AdaptiveConnectionManager` in Kotlin preferably. Swift, TypeScript, or Go are acceptable alternatives.

### REQ-CONN-002 — Connection Maintenance

Maintain a WebSocket connection or a simulated connection capable of demonstrating the required connection-management behavior.

### REQ-CONN-003 — Adaptive Idle-Timeout Learning

Estimate the effective connection idle timeout using an exponential moving average (EMA) or a comparable method.

Maintain the learned estimate and update it from relevant observations. Document how observations are collected and how unreliable or incomplete observations are handled.

### REQ-CONN-004 — Adaptive Heartbeats

Schedule application-level heartbeats at approximately 70–85% of the learned idle timeout, with jitter.

The scheduling strategy shall adapt as the learned timeout changes and shall support detection of a connection that has silently stopped working.

### REQ-CONN-005 — Quality-Aware Reconnection

Implement reconnection using exponential backoff and jitter, taking network quality into account.

Document the retry policy, its limits, and how it avoids excessive retry traffic during sustained outages or synchronized reconnect attempts.

### REQ-CONN-006 — Outbox for Pending Work

Implement an in-memory or durable outbox for unacknowledged outbound events or user intents.

Define how pending items are retained, acknowledged, retried, and handled across connection interruptions. Ensure that retrying a request does not, by itself, imply that the underlying transaction should execute more than once.

### REQ-CONN-007 — Lifecycle Callbacks and Events

Provide callbacks or event emission for relevant lifecycle changes, including:

- Connected.
- Disconnected.
- Event received.
- Intent queued.
- Outbound item acknowledged or failed.
- Reconnection or recovery events, where applicable.

### REQ-CONN-008 — Foreground-Service Protection

Provide methods to protect and unprotect the simulated foreground service, demonstrating when persistent execution is requested and when that protection is released.

### REQ-CONN-009 — Connection Metrics

Expose at least the following metrics:

- Current learned idle timeout.
- Number of consecutive connection failures.
- Last heartbeat round-trip time (RTT).

### REQ-CONN-010 — Bonus Capabilities

Where feasible, investigate and implement:

- Network-change detection.
- Detection or recovery from NAT-related connection flushing.
- BLE-based liveness signals that can reset relevant idle timers or influence delivery priority.

### REQ-CONN-011 — Test and Demonstration Harness

Provide a reproducible test or demonstration harness that exercises the connection manager, adaptive behavior, and recovery paths.

## 4. Diagnosis of Reported Production Failures

### REQ-DIAG-001 — Silent Connection Failure

**Observed behavior:** Heartbeats succeed for two to three minutes before the connection silently dies.

Identify likely causes, specify diagnostic data that can distinguish among them, and propose corrective changes. Include a method for verifying whether the connection is genuinely usable rather than merely appearing connected locally.

### REQ-DIAG-002 — Delayed Events After Process Death

**Observed behavior:** Events are delayed by four to fifteen minutes after the phone process dies.

Investigate event delivery, application process lifecycle, background execution restrictions, and recovery behavior. Identify the likely sources of delay and propose changes that improve timely delivery and recovery.

### REQ-DIAG-003 — Slow Double-Tap Intent Delivery

**Observed behavior:** Double-tap intents sometimes take more than eight seconds to reach the backend.

Analyze the full intent-delivery path, identify measurable latency bottlenecks, and propose concrete improvements. Distinguish time spent capturing the action, relaying it, waiting for connectivity, transmitting the request, and receiving an acknowledgment where those measurements are available.

### REQ-DIAG-004 — Foreground Notification with a Frozen Application

**Observed behavior:** Some Transsion devices display a foreground-service notification while the application becomes frozen after approximately one minute.

Investigate Android background restrictions and manufacturer-specific behavior. Explain why a visible foreground-service notification does not prove that the application is actively executing or maintaining network communication.

Propose corrective measures and ways to verify their effectiveness on affected devices.

### REQ-DIAG-005 — Diagnostic Evidence and Corrective Actions

For each reported failure, document:

- Observed symptoms.
- Diagnostic data and measurements.
- Analysis of likely causes.
- Proposed corrective actions.
- Verification tests and their results.

Separate observed evidence from suspected causes. Do not report a cause as confirmed unless measurements or a reproducible test support that conclusion.

## 5. Engineering Trade-Offs

### REQ-TRADE-001 — Foreground Service Versus Push Delivery

Compare persistent foreground-service-based connectivity with delivery based mainly on high-priority Firebase Cloud Messaging (FCM) and watch push options.

Discuss reliability, latency, application lifecycle, platform restrictions, battery impact, and operational complexity. Explain the conditions under which each approach is appropriate.

### REQ-TRADE-002 — Battery Consumption Versus Reliability

Explain how heartbeat frequency, connection persistence, and reconnection behavior affect battery consumption and delivery reliability.

Describe the strategy used to balance these competing requirements, including how behavior changes under different network conditions or delivery priorities.

### REQ-TRADE-003 — Direct Watch Connectivity Versus Phone Relay

Evaluate whether the smartwatch should ever communicate directly with the backend or whether communication should be relayed through the phone.

Compare the alternatives in terms of reliability, latency, network availability, battery consumption, complexity, and recovery behavior. Account for the assessment's stated architecture in which the phone companion acts as relay and the watch is the primary notification and engagement surface.

## 6. Scalability

### REQ-SCALE-001 — Support for 500,000 Concurrent Users

Describe how the system could evolve to support 500,000 concurrent users across 2G, 3G, and 4G networks and devices with different manufacturer-specific restrictions.

Address:

- Connection and session management.
- Backend resource consumption.
- Heartbeat traffic.
- Reconnection storms.
- Event delivery and recovery.
- Capacity planning and bottleneck identification.
- Monitoring and operational reliability.

Support capacity claims with explicit assumptions, calculations, measurements, or a test plan.

## 7. Testing and Verification

### REQ-TEST-001 — Connection Failure and Recovery

Test the connection manager under relevant failure conditions, including silent connection loss, network interruption, reconnection, and phone-watch disconnection.

### REQ-TEST-002 — Process Death and Event Recovery

Test event behavior when the phone process is killed or interrupted, including resulting delivery delays, recovery behavior, and any limitations of the test environment.

### REQ-TEST-003 — Transaction-Intent Handling

Test the complete path from a double-tap action on the watch through backend processing and communication of the transaction outcome.

Verify the handling of interrupted requests, retries, duplicate delivery, and uncertain outcomes. Distinguish successful request delivery from successful transaction execution.

### REQ-TEST-004 — Diagnostic Scenario Reproduction

Reproduce the reported failure scenarios where feasible. Record the environment, steps, observed behavior before changes, corrective changes, and results after changes.

### REQ-TEST-005 — Automated Tests

Provide automated tests for required connection-manager behavior, including adaptive heartbeat scheduling, timeout learning, reconnection, and outbox handling.

### REQ-TEST-006 — Demonstration

Provide a reproducible demonstration of the implementation and its principal behaviors.

### REQ-TEST-007 — Test Evidence

Record test procedures, execution environment, expected results, observed results, failures, and corrective changes. Clearly distinguish automated simulation results from tests performed on physical devices or real mobile networks.

## 8. Requirement Traceability

Each requirement ID shall connect the assessment requirement to the relevant design, implementation, and verification evidence.

| Requirement Group | Scope                                                                        | Verification Evidence                                            |
| ----------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| REQ-ARCH          | Architecture, backend event source, and end-to-end event-to-transaction flow | Architecture diagram and design documentation                    |
| REQ-CONN          | AdaptiveConnectionManager                                                    | Source code, automated tests, and demonstration                  |
| REQ-DIAG          | Production failure diagnosis                                                 | Diagnostic analysis and verification results                     |
| REQ-TRADE         | Engineering trade-offs                                                       | Technical comparison and design rationale                        |
| REQ-SCALE         | 500,000 concurrent users                                                     | Scalability analysis and supporting calculations or measurements |
| REQ-TEST          | Testing and demonstration                                                    | Test procedures, results, and reproduction instructions          |

## 9. Verification Status

Requirement verification shall be tracked using the following statuses:

- **Not started:** Work has not begun.
- **In progress:** Research, design, implementation, or testing is underway.
- **Verified:** Acceptance criteria have been met and supporting evidence is available.
- **Blocked:** A technical issue or dependency prevents progress.

A requirement shall be marked verified only when the relevant design, implementation, test result, or other applicable evidence supports that status.
