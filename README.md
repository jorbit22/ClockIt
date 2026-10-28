# Clockit - Real-time Event-to-Transaction Streaming Infrastructure
## Purpose
Clockit explores reliable delivery of backend events to a phone and smartwatch, followed by safe transaction-intent processing and outcome communication.
## Current implementation status
The repository contains an initial TypeScript implementation of four components:
- **Event source:** creates and validates structured event envelopes.
- **Backend delivery:** tracks per-device delivery state, leases, retries, expiry, dead-lettering, and phone-storage acknowledgments in memory.
- **Adaptive connection manager:** implements an EMA idle-timeout estimate, bounded heartbeat scheduling with jitter, reconnect backoff, a simple in-memory outbox, and simulated foreground protection.
- **Transaction processor:** models intent states, duplicate-intent handling, uncertain execution outcomes, reconciliation, and outcome communication using an in-memory simulated executor.
These components and the demo are assessment prototypes, not a production-ready financial transaction system.
## Run locally
The following commands use the npm CLI directly because the normal npm launcher is unreliable in the current Windows environment.
```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run demo
```
## Latest local verification
On 2026-10-28, the test suite completed with **32 passing tests and 0 failures**. TypeScript typechecking completed successfully. The demo dispatched one sample event to two simulated devices, recorded both as `PHONE_STORED`, then simulated a lost transaction-execution response and reconciled the original execution to `SUCCEEDED` while the executor call count remained one.
Detailed environment, results, and limitations: `docs/testing/test-evidence.md`.
## Important limitations
- Delivery records, transaction intents, execution records, and the connection-manager outbox are in memory; process-restart durability is not implemented.
- Transport and phone acknowledgments in the demo are simulated. No real WebSocket, FCM, Android foreground service, BLE relay, or smartwatch interaction is implemented by this prototype.
- Transaction execution uses a simulator, not a bank, payment provider, or production ledger. The prototype does not prove production-grade exactly-once execution.
- No physical-device, carrier-network, security, battery, or 500,000-concurrent-user capacity test has been completed.
- A passing unit test proves only the behavior covered by that test and within its test environment.
## Project documentation
- Requirements: `docs/requirements/assessment-requirements.md`
- Traceability: `docs/requirements/assessment-traceability.md`
- Research: `docs/research/`
- Design: `docs/design/`
- Decisions: `docs/decisions/`
- Testing evidence: `docs/testing/test-evidence.md`
- Operations: `docs/operations/`
