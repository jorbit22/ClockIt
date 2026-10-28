# Clockit — Real-Time Event-to-Transaction Streaming Infrastructure

## Assessment Submission Map

| Part | What it covers | Where to find it |
|------|---------------|-----------------|
| Part 1 — System Design | Architecture diagram, connection manager design, end-to-end flow, top 5 African failure modes | `docs/design/integrated-architecture.md` · `docs/design/adaptive-connection-manager.md` · `docs/research/african-mobile-network-failure-modes-research.md` |
| Part 2 — Coding Exercise | `AdaptiveConnectionManager` class + demo harness | `src/connection-manager/adaptive-connection-manager.ts` · `src/demo.ts` · `test/connection-manager/` |
| Part 3 — Debugging & Edge Cases | Root causes, diagnostic additions, concrete fixes for 4 production symptoms | `answers/parts-3-and-4.md` |
| Part 4 — Trade-offs & Senior Judgement | Foreground service vs FCM, battery vs reliability, watch connectivity, 500k scaling | `answers/parts-3-and-4.md` |

---

## Purpose
Clockit is a TypeScript assessment prototype exploring reliable delivery of backend events to a phone and smartwatch, watch interaction, transaction-intent processing, and outcome communication.
## Current Implementation
The repository contains six implemented prototype components:
- **Event source:** creates and validates structured event envelopes.
- **Backend delivery:** manages per-device delivery state, leases, retries, expiry, dead-lettering, and phone-storage acknowledgments in memory.
- **Adaptive connection manager:** implements EMA-based idle-timeout estimation, heartbeat scheduling with jitter, reconnect backoff, an in-memory outbox, and simulated foreground protection.
- **Phone-to-watch relay:** models event delivery to a simulated watch store, acknowledgment handling, duplicate detection, expiry, and retry after a lost acknowledgment.
- **Watch interaction:** models double-tap intent submission, expiry checks, and duplicate-intent protection.
- **Backend transaction processor:** models transaction-intent states, simulated execution, uncertain outcomes, reconciliation, and outcome communication.
The integrated console demo exercises these components in a simulated environment. This is an assessment prototype, not a production-ready financial transaction system.
## Run Locally
Requirements: a supported Node.js installation and npm.
```powershell
npm install
npm test
npm run typecheck
npm run demo
```
## Latest Local Verification
On 28 October 2026:
- **Automated tests:** 55 passed, 0 failed.
- **TypeScript typecheck:** completed successfully with no reported errors.
- **Integrated demo:** completed successfully.
The demo sent an event to two simulated devices, recorded both phone-storage acknowledgments, relayed the event to a simulated watch store, and accepted a simulated double-tap transaction intent. A simulated lost execution response produced `OUTCOME_UNKNOWN`; reconciliation subsequently changed the intent to `SUCCEEDED` while the executor call count remained one.
These results establish only the behaviors exercised by the local tests and demo. They do not establish complete assessment compliance or production reliability.
Detailed results and limitations: `docs/testing/test-evidence.md`.
## Limitations
- Delivery records, relay records, transaction intents, execution records, and outbox state are held in memory. Durable storage and process-restart recovery are not implemented.
- Transports, watch storage, transaction execution, and foreground protection are simulated where stated.
- No real WebSocket, FCM, Android lifecycle behavior, BLE communication, or physical smartwatch gesture detection has been demonstrated.
- Transaction execution does not use a real bank, payment provider, or production ledger. Production-grade exactly-once execution has not been established.
- Physical-device diagnostics, carrier-network testing, security review, battery measurements, and capacity testing for 500,000 concurrent users have not been completed.
- Passing tests establish only the behavior covered by those tests in their execution environment.
## Project Documentation
- Assessment requirements: `docs/requirements/assessment-requirements.md`
- Requirements traceability: `docs/requirements/assessment-traceability.md`
- Research: `docs/research/`
- Component designs: `docs/design/`
- Architecture decisions: `docs/decisions/`
- Test evidence: `docs/testing/test-evidence.md`
- Operations: `docs/operations/`
