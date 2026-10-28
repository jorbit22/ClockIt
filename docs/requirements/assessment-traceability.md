# Assessment Requirements Traceability

## 1. Purpose and scope

This document maps assessment requirements to research, proposed designs, architecture decisions, implementation artifacts, tests, and demonstration evidence.

Traceability covers the relationship between requirements, design decisions, implementation artifacts, tests, and demonstration evidence. Design documentation establishes intended behavior; implementation and verification records establish what has been built and demonstrated.

The repository currently contains research, proposed component designs, and architecture decision records through Stage 7. These artifacts do not establish that the system has been implemented, tested, or verified.

## 2. Status definitions

| Status      | Definition                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Documented  | Relevant research or design documentation exists; implementation and verification may remain outstanding. |
| Partial     | Some aspects of the requirement are covered, but the full requirement is not yet addressed or evidenced.  |
| Not started | No sufficient requirement-specific design, implementation, or verification evidence has been identified.  |
| Unverified  | An implementation or claimed result exists, but adequate verification evidence has not been established.  |
| Verified    | Recorded evidence demonstrates that the requirement is satisfied within the stated environment and scope. |

Statuses reflect the evidence currently established in the project documentation and confirmed repository state. A proposed design, planned test, or successful whitespace check does not establish implementation or behavioral verification.

## 3. Existing project documentation

### Requirements and traceability

| Document                                       | Scope                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `docs/requirements/assessment-requirements.md` | Assessment requirements and requirement identifiers.                     |
| `docs/requirements/assessment-traceability.md` | Requirement coverage, status, remaining work, and verification evidence. |

### Stage 1 â€” Backend event source and publication

| Document                                      | Scope                                                    |
| --------------------------------------------- | -------------------------------------------------------- |
| `docs/research/event-source-research.md`      | Research supporting event creation and publication.      |
| `docs/design/event-source.md`                 | Event source, event contract, publication, and validity. |
| `docs/decisions/ADR-001-event-publication.md` | Decision record for backend event publication.           |

### Stage 2 â€” Backend-to-phone event delivery

| Document                                           | Scope                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `docs/research/backend-event-delivery-research.md` | Durable handoff, delivery acknowledgment, retries, and recovery research. |
| `docs/design/backend-event-delivery.md`            | Proposed backend-to-phone delivery service and per-device delivery state. |
| `docs/decisions/ADR-002-backend-event-delivery.md` | Decision record for backend event delivery.                               |

### Stage 3 â€” Adaptive connection manager

| Document                                                | Scope                                                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `docs/research/connection-manager-research.md`          | Connection liveness, Android lifecycle restrictions, and recovery research.                                |
| `docs/design/adaptive-connection-manager.md`            | Proposed timeout learning, heartbeats, reconnection, pending work, callbacks, metrics, and test scenarios. |
| `docs/decisions/ADR-003-adaptive-connection-manager.md` | Decision record for the connection manager.                                                                |

### Stage 4 â€” Phone-to-watch relay

| Document                                         | Scope                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `docs/research/phone-to-watch-relay-research.md` | BLE, Wear OS Data Layer, application acknowledgments, and relay recovery research. |
| `docs/design/phone-to-watch-relay.md`            | Proposed relay protocol, pending-message handling, acknowledgments, and recovery.  |
| `docs/decisions/ADR-004-phone-to-watch-relay.md` | Decision record for the relay.                                                     |

### Stage 5 â€” Watch interaction and transaction-intent initiation

| Document                                      | Scope                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `docs/research/watch-interaction-research.md` | Watch input, gesture handling, platform considerations, and interaction research.                             |
| `docs/design/watch-interaction.md`            | Proposed interaction states, stable intent identity, latency instrumentation, and uncertain-outcome handling. |
| `docs/decisions/ADR-005-watch-interaction.md` | Decision record for watch interaction and intent initiation.                                                  |

### Stage 6 â€” Backend transaction processing

| Document                                                   | Scope                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `docs/research/backend-transaction-processing-research.md` | Idempotent requests, transaction processing, execution uncertainty, and outcome recovery research.    |
| `docs/design/backend-transaction-processing.md`            | Proposed backend intent lifecycle, execution boundary, concurrency controls, and outcome persistence. |
| `docs/decisions/ADR-006-backend-transaction-processing.md` | Decision record for backend transaction processing.                                                   |

### Stage 7 â€” Integrated architecture

| Document                                            | Scope                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/research/integrated-architecture-research.md` | Cross-component evidence, handoff inventory, failure scenarios, and unresolved integration questions.                                                  |
| `docs/design/integrated-architecture.md`            | Proposed end-to-end architecture, identities, acknowledgment contracts, ownership of pending work, recovery, observability, and verification strategy. |
| `docs/decisions/ADR-007-integrated-architecture.md` | Integrated architecture decision record, alternatives, unresolved decisions, and verification requirements.                                            |

All seven stages currently represent documented architecture work, not a verified running system.

## 4. Architecture requirements

| Requirement                                         | Existing coverage                                                                                                                                                         | Outstanding coverage and required evidence                                                                                                                                                                                                                                                                               | Status     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| REQ-ARCH-001 â€” High-level architecture diagram      | `docs/design/integrated-architecture.md` includes the logical architecture diagram and component boundaries.                                                              | Review the diagram against every required element: backend event sources, event handoff, phone connection manager, relay, smartwatch engagement, BLE, transaction execution, and outcome communication. Resolve any missing paths or responsibilities.                                                                   | Documented |
| REQ-ARCH-002 â€” Backend event source and handoff     | Event source, publication decision, backend delivery research/design, and integrated acknowledgment contracts are documented.                                             | Implement and test event creation, publication, recipient delivery, durable handoff, acknowledgment milestones, and failure recovery. Record the results.                                                                                                                                                                | Documented |
| REQ-ARCH-003 â€” Phone connection manager             | Connection-manager research/design and integrated recovery responsibilities are documented.                                                                               | Implement and verify learned timeout behavior, heartbeats, silent-failure detection, reconnection, replay, applicable Android foreground-service and companion-device behavior, and BLE communication.                                                                                                                   | Documented |
| REQ-ARCH-004 â€” End-to-end event-to-transaction flow | Relay, watch interaction, backend transaction processing, and integrated lifecycle designs cover the proposed flow, including double-tap behavior and uncertain outcomes. | Implement and test the complete flow, including phone death, network interruption, interrupted intents, duplicate delivery, safe retries, execution uncertainty, and a completed transaction whose outcome was not communicated. Demonstrate that delivery acknowledgment and transaction execution are separate states. | Documented |
| REQ-ARCH-005 â€” African mobile-network failure modes | Five failure modes, their effects, proposed mitigations, and diagnostic evidence are documented in `docs/research/african-mobile-network-failure-modes-research.md`. | Validate source claims and design coverage; implement mitigations and run reproducible tests. Do not present untested hypotheses as confirmed causes. | Partial |

## 5. Connection manager requirements

| Requirement                                            | Existing coverage                                                                                                                                    | Outstanding coverage and required evidence                                                                                                                                                  | Status     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| REQ-CONN-001 â€” Implementation language                 | TypeScript is selected for the assessment implementation.                                                                                            | Implement the TypeScript solution and record build and execution results in the documented environment.                                                                                     | Documented |
| REQ-CONN-002 â€” WebSocket or simulated connection       | The connection-manager design defines an injectable transport and a simulated connection direction for deterministic testing.                        | Implement the selected transport and demonstrate connection establishment, message exchange, disconnection, and recovery. Document the transport's limitations.                             | Documented |
| REQ-CONN-003 â€” Idle-timeout learning                   | The design specifies EMA-based learning from qualified samples and distinguishes unknown estimates from configured fallback values.                  | Implement the estimator and define sample-qualification rules. Test valid, incomplete, confounded, and unknown-cause observations; record actual estimator results.                         | Documented |
| REQ-CONN-004 â€” Adaptive heartbeat                      | The design specifies heartbeat scheduling at a randomized 70â€“85% of the learned timeout, plus liveness detection.                                    | Implement and test heartbeat scheduling, jitter, response deadlines, adaptation when the estimate changes, and behavior when the estimate is unknown.                                       | Documented |
| REQ-CONN-005 â€” Quality-aware reconnection              | The design specifies exponential backoff with jitter.                                                                                                | Implement retry limits, delay bounds, network-quality inputs, reset rules, and connection-storm safeguards. Test repeated failures and network changes.                                     | Documented |
| REQ-CONN-006 â€” Outbox and safe retry                   | Connection-manager, relay, backend-delivery, transaction-processing, and integrated designs define pending-work ownership and safe-retry principles. | Implement the appropriate storage and acknowledgment contracts. Test retention, retry, process restart, duplicate delivery, and transaction idempotency boundaries.                         | Documented |
| REQ-CONN-007 â€” Lifecycle callbacks                     | The connection-manager design specifies lifecycle events, callbacks, and observability requirements.                                                 | Implement and test callbacks for connection changes, received events, queued intents, outbound acknowledgment or failure, and reconnection recovery. Verify callback ordering and payloads. | Documented |
| REQ-CONN-008 â€” Simulated foreground-service protection | The connection-manager design includes simulated foreground-service protection and distinguishes simulation from actual Android behavior.            | Implement and test simulated protection, interruption, recovery, and stop behavior. Do not claim that simulation proves a real Android process will survive background restrictions.        | Documented |
| REQ-CONN-009 â€” Connection metrics                      | The design identifies learned idle timeout, consecutive failures, last heartbeat round-trip time, and additional useful metrics.                     | Implement metric collection and verify values, units, updates, and unavailable values.                                                                                                      | Documented |
| REQ-CONN-010 â€” Network change, NAT, and BLE liveness   | The research and design distinguish network-change signals, backend transport liveness, and BLE liveness.                                            | Implement and test network-change recovery and relevant NAT-expiry simulation. Test BLE liveness separately from backend liveness.                                                          | Documented |
| REQ-CONN-011 â€” Reproducible test/demo harness          | The design specifies injectable time, scheduling, randomness, transport, storage, and observers.                                                     | Implement a repeatable harness with deterministic scenarios, setup instructions, expected outcomes, and recorded results.                                                                   | Documented |

## 6. Diagnostic requirements

| Requirement                                                             | Existing coverage                                                                                                      | Outstanding coverage and required evidence                                                                                                                                                                                                                                        | Status     |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| REQ-DIAG-001 â€” Heartbeats succeed before silent connection death        | Connection research/design address liveness, heartbeat response, and silent failure.                                   | Investigate the reported failure after two to three minutes. Record symptoms, timestamps, heartbeat results, transport state, candidate causes, evidence distinguishing those causes, corrective actions, and recovery tests. Distinguish suspected causes from confirmed causes. | Partial    |
| REQ-DIAG-002 â€” Delayed events after phone process death                 | Backend delivery, relay, connection-manager, and integrated designs describe pending work and recovery.                | Investigate events reported as delayed by four to fifteen minutes after process death. Distinguish server-side queue delay, retries, process lifecycle, background restrictions, and reconnection delay. Record reproduction and before-and-after evidence.                       | Partial    |
| REQ-DIAG-003 â€” Double-tap intent takes more than eight seconds          | Watch interaction and backend transaction designs specify correlated stage timestamps and intent/execution boundaries. | Capture an instrumented end-to-end trace, measure stage-level latency, identify the evidenced bottleneck, and compare measurements before and after justified corrective action. The reported delay is not yet a confirmed measurement in this project.                           | Documented |
| REQ-DIAG-004 â€” Transsion device freezes despite foreground notification | Connection research documents general Android background restrictions and foreground-service limitations.              | Investigate the target device and software conditions. Distinguish service suspension, process suspension, network failure, and dependency failure where applicable. Verify mitigations on the target device when available.                                                      | Partial    |
| REQ-DIAG-005 â€” Diagnostic evidence format                               | Component designs and integrated architecture define failure scenarios, instrumentation, and evidence requirements.    | Produce a consistent diagnostic record for all four scenarios, including symptoms, diagnostic data, cause analysis, corrective actions, verification tests, actual results, environment, and limitations.                                                                         | Documented |

## 7. Trade-off requirements

| Requirement                                                             | Existing coverage                                                                                                                  | Outstanding coverage and required evidence                                                                                                                                                                                      | Status     |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| REQ-TRADE-001 â€” Persistent foreground service versus FCM and watch push | Android foreground-service restrictions, FCM delivery behavior, Doze effects, trade-offs, and a proposed hybrid direction are documented in `docs/research/architecture-trade-offs-research.md`. | Confirm the approach against target Android versions; implement and test delivery, lifecycle, recovery, and latency. Do not claim measured reliability or latency without test evidence. | Partial |
| REQ-TRADE-002 â€” Battery versus reliability | Heartbeat timing, learned-timeout trade-offs, jitter, reconnection strategy, battery considerations, and a verification plan are documented in `docs/research/architecture-trade-offs-research.md`. | Implement the required timeout estimator, heartbeat target, and reconnect behavior; measure failure-detection delay, retries, delivery latency, and battery impact. | Partial |
| REQ-TRADE-003 â€” Direct watch backend versus phone relay | Phone relay versus direct watch networking, platform behavior, trade-offs, and the proposed primary relay approach are documented in `docs/research/architecture-trade-offs-research.md`. | Implement and test phone-watch delivery and recovery; evaluate direct connectivity only if requirements justify it. Verify behavior on supported devices before claiming reliability or battery advantages. | Partial |

## 8. Scale requirement

| Requirement                              | Existing coverage                                                                                                                                | Outstanding coverage and required evidence                                                                                                                                                                                                                                                                                                                                 | Status     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| REQ-SCALE-001 â€” 500,000 concurrent users | Backend delivery and integrated architecture documents identify relevant connection, heartbeat, delivery, recovery, and resource considerations. | Produce a dedicated capacity model for 500,000 concurrent users across 2G, 3G, 4G, and relevant device-manufacturer restrictions. Include workload assumptions, heartbeat traffic, connection resources, message throughput, reconnect storms, recovery backlog, monitoring, calculations, and a load-test plan. Record appropriate measurements before claiming capacity. | Partial |

## 9. Testing and demonstration requirements

| Requirement                                     | Existing coverage                                                                                                                                           | Outstanding coverage and required evidence                                                                                                                                                                                                     | Status     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| REQ-TEST-001 â€” Connection failure and recovery  | Connection-manager and integrated designs define failure and recovery scenarios.                                                                            | Implement automated tests for connection loss, silent failure, reconnection, recovery, and independent backend/BLE liveness. Record expected and actual results.                                                                               | Documented |
| REQ-TEST-002 â€” Process death and event recovery | Backend delivery, relay, connection-manager, watch interaction, and integrated designs describe pending work and recovery.                                  | Test process termination, restart, pending-event recovery, inbox-to-relay ownership transfer, acknowledgment state, duplicate delivery, and durable intent recovery. Record resulting state transitions.                                       | Documented |
| REQ-TEST-003 â€” End-to-end transaction intent    | Watch interaction, backend processing, and integrated designs distinguish intent creation, acceptance, execution, uncertainty, and outcome communication.   | Test intent creation, interrupted requests, retries, duplicate delivery, concurrent processing, uncertain outcomes, and completed transactions whose outcomes are not communicated. Distinguish successful delivery from successful execution. | Documented |
| REQ-TEST-004 â€” Reproduce diagnostic scenarios   | Research and designs identify the required diagnostic scenarios and relevant instrumentation.                                                               | Reproduce REQ-DIAG-001 through REQ-DIAG-004 where the required environments are available. Record baseline evidence, corrective actions where justified, and post-correction results.                                                          | Documented |
| REQ-TEST-005 â€” Automated core tests             | Component designs specify tests for heartbeat scheduling, timeout learning, reconnection, outbox behavior, relay delivery, intent processing, and recovery. | Implement and execute the automated tests, including boundary conditions, ambiguous observations, retries, duplicates, concurrent workers, and recovery after interruption.                                                                    | Documented |
| REQ-TEST-006 â€” Reproducible demonstration       | Connection-manager and integrated designs specify deterministic scenarios and an injectable test harness.                                                   | Deliver a working demonstration with setup and execution instructions, expected output, observable failure/recovery behavior, and recorded results.                                                                                            | Documented |
| REQ-TEST-007 â€” Test evidence and environment    | Research and designs distinguish simulation, emulator, physical-device, carrier-network, and capacity evidence.                                             | Produce test records containing environment, software versions, steps, expected results, actual results, failures, and limitations. No consolidated execution evidence has yet been established in the confirmed repository state.             | Documented |

## 10. Traceability and verification criteria

Each requirement must map to:

1. The relevant research or design artifact.
2. The implementation artifact that provides the required behavior, once implemented.
3. The test, measurement, or diagnostic procedure used to evaluate it.
4. The evidence location and actual result.
5. The environment and scope in which the result was obtained.
6. Any remaining limitations or unverified assumptions.

Verification records must identify the relevant test or measurement, execution environment, expected behavior, observed result, and evidence location.

Simulation results establish behavior only within the simulation's scope. They do not independently establish behavior on physical devices, carrier networks, or production infrastructure.

A requirement's status must reflect the strongest evidence available for its stated scope. Research completion, design completion, implementation presence, and successful verification are distinct states.

The requirement traceability audit must be updated as implementation and test evidence becomes available. Status changes must be supported by actual artifacts or recorded results.

## 11. Unresolved design decisions

| Decision area                | Unresolved question                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Event publication            | Which broker, outbox storage, and publication configuration will be used?                                                                |
| Backend delivery             | Which transport, acknowledgment authentication, and optional push-notification strategy will be implemented?                             |
| Connection manager           | What estimator parameters, sample-qualification rules, response deadlines, fallback heartbeat policy, and reconnect limits will be used? |
| Pending work                 | Which storage, retention, acknowledgment, replay, and terminal-failure policies apply at each boundary?                                  |
| Phone inbox and relay        | Will the relay maintain its own durable copy, or will the inbox and relay use shared storage with an atomic ownership transition?        |
| Watch platform and transport | What is the target watch platform, and will communication use BLE GATT, Wear OS Data Layer, or another supported transport?              |
| Relay protocol               | What message schema, acknowledgment protocol, authorization, expiry, and retry rules will be implemented?                                |
| Transaction contract         | What are the API schema, authorization rules, idempotency scope, and request-retention policy?                                           |
| Execution adapter            | What execution mechanism is required, and what idempotency and authoritative status-reconciliation capabilities does it support?         |
| Backend concurrency          | What claim, lease, or equivalent concurrency-control mechanism will be used, and how will stale workers be handled?                      |
| Outcome recovery             | Which delivery, acknowledgment, retrieval, and reconciliation mechanisms will be implemented?                                            |
| Diagnostics                  | Which physical devices, operating-system versions, manufacturer-specific restrictions, and mobile-network conditions can be tested?      |
| Trade-offs                   | Which delivery and connection strategies will be selected after the required comparisons?                                                |
| Capacity                     | Which workload assumptions, traffic models, resource estimates, and measurements will support the 500,000-user target?                   |

These decisions remain open until supported by documented rationale and, where applicable, research, calculations, implementation constraints, or experimental evidence. Relevant decisions should be recorded in the appropriate component ADR rather than silently treated as settled by the integrated architecture.

## 12. Current assessment status
The repository has progressed from documented designs to an initial TypeScript prototype. The current implementation and local verification evidence are recorded in `docs/testing/test-evidence.md`.
Implemented and locally tested components:
1. Event creation and basic validation.
2. In-memory backend event delivery, per-device state, retries, expiry, and phone-storage acknowledgment.
3. Adaptive timeout estimation, heartbeat scheduling, reconnect backoff, an in-memory outbox, and simulated foreground protection.
4. Transaction-intent state handling, duplicate-intent protection, simulated execution, uncertain-outcome reconciliation, and outcome communication.
The recorded local verification on 2026-10-28 completed with 32 passing tests, zero failures, and a successful TypeScript typecheck. The console demo also completed, including recovery from a simulated lost execution response without a second executor call.
These results establish only the behavior covered by the local tests and simulation. They do not establish production readiness or full satisfaction of the assessment requirements.
Outstanding work includes:
- Real phone-to-watch relay and watch interaction.
- Durable storage and recovery after process restart.
- Real transport, Android lifecycle, BLE, and physical-device testing.
- Reproducible diagnostic investigations for the specified failure scenarios.
- Validation of the African mobile-network failure-mode research and remaining trade-off decisions.
- A capacity model and appropriate load testing for 500,000 concurrent users.
- Security, battery, carrier-network, and production payment-execution evidence.
The detailed implementation status and limitations are recorded in Section 13. Use `docs/testing/test-evidence.md` for the recorded local commands, outcomes, environment, and evidence boundaries.

## 13. Implementation and verification update - 2026-10-28
This section supersedes earlier statements in this document that no implementation, automated test results, or demonstration evidence exist. The earlier sections describe the original documented-design state and should be read alongside this update.
### Implemented prototype components
| Component | Current implementation evidence | Scope and limitations | Status |
| --- | --- | --- | --- |
| Event source | `src/event-source/event-source.ts`; `test/event-source/event-source.test.ts` | Structured event creation and basic validation are implemented and unit-tested. Durable publication and a broker are not implemented. | Partial |
| Backend event delivery | `src/backend-delivery/`; tests under `test/backend-delivery/` | In-memory per-device delivery state, claims/leases, retry scheduling, expiry, dead-lettering, and phone-storage acknowledgment are implemented and unit-tested. No production database or real transport is connected. | Partial |
| Adaptive connection manager | `src/connection-manager/adaptive-connection-manager.ts`; tests under `test/connection-manager/` | EMA estimate, bounded heartbeat timing with jitter, reconnect backoff, in-memory outbox, and simulated foreground protection have unit tests. Actual socket liveness, Android behavior, BLE, and durable outbox recovery are not demonstrated. | Partial |
| Backend transaction processing | `src/backend-transaction/transaction-processor.ts`; `test/backend-transaction/transaction-processor.test.ts` | In-memory intent state, duplicate-intent handling, simulated execution, unknown outcome, reconciliation, and outcome callback behavior are unit-tested. No production execution adapter, durable database, or ledger is implemented. | Partial |
| Console demo | `src/demo.ts`; `docs/testing/test-evidence.md` | Local demo shows simulated event delivery to two devices and recovery from a simulated lost execution response without a second executor call. | Verified within demo scope |
| Automated test suite | `docs/testing/test-evidence.md` | 32 tests passed, 0 failed in the recorded local run on 2026-10-28. Only behavior covered in this environment is evidenced. | Verified within test scope |
| TypeScript typecheck | `docs/testing/test-evidence.md` | Typecheck completed without reported errors in the recorded local run on 2026-10-28. | Verified within typecheck scope |
### Requirements affected by the prototype
The new implementation provides partial evidence for REQ-ARCH-002, REQ-ARCH-003, REQ-ARCH-004, REQ-CONN-001 through REQ-CONN-006, REQ-CONN-008, REQ-CONN-011, and REQ-TEST-003, REQ-TEST-005, and REQ-TEST-006. This is **partial coverage**, not full requirement satisfaction. Update each detailed row only when its specific acceptance conditions and evidence are checked. Simulated foreground protection is not evidence of Android process survival, and a local demo is not evidence of a real phone-to-watch end-to-end flow.
No evidence is yet recorded for a real phone/watch relay, physical-device diagnostic reproduction, real carrier-network behavior, production durability, production payment execution, battery measurements, or 500,000-user capacity.
The detailed run record is `docs/testing/test-evidence.md`. The current implementation summary and local commands are in `README.md`.
