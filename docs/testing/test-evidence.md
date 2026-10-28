# Local Test Evidence
## Record
- **Execution date:** 2026-10-28
- **Environment:** Windows PowerShell; Node.js v22.23.4; npm CLI 10.9.9; TypeScript 7.0.2; tsx 4.23.15
- **Scope:** Local TypeScript unit tests, typecheck, and console demo
- **Evidence source:** Command output from the local repository run
## Automated tests
Command:
```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test
```
Result: **32 tests passed; 0 failed; 0 skipped.**
The suite covers event creation and validation; per-device delivery claims, leases, retries, expiry, dead-lettering, duplicate publication, and device acknowledgment; connection-manager timeout estimation, heartbeat jitter, reconnect delay, in-memory outbox and simulated protection; and transaction-intent success/failure, duplicate submission, conflicting intent identity, uncertain outcomes, reconciliation, and outcome-communication retry.
These are component-level tests. They do not establish that every assessment requirement is satisfied.
## Typecheck
Command:
```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck
```
Result: completed successfully with no reported TypeScript errors.
## Demo
Command:
```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run demo
```
Observed results:
1. A sample event was created.
2. The simulated transport sent it to `demo-phone-001` and `demo-phone-002`.
3. Both delivery records were acknowledged as `PHONE_STORED` in memory.
4. A simulated transaction execution lost its response and the intent became `OUTCOME_UNKNOWN`.
5. Reconciliation found the original simulated execution and changed the intent to `SUCCEEDED`.
6. The executor call count remained **1** before and after reconciliation.
7. The recorded outcome was passed to the demo outcome callback.
The demo showed a heartbeat interval of 96,000 ms and a reconnect delay of 500 ms for its configured deterministic sample.
## Evidence boundary and outstanding verification
The tests and demo ran locally. Delivery, phone receipt, transaction execution, and foreground protection are simulated where stated. Relevant records and outbox state are in memory.
Not demonstrated by this evidence:
- Process-restart recovery or durable storage.
- Real backend transport, FCM, Android lifecycle behavior, BLE, or smartwatch input.
- Real payment-provider execution, a production ledger, or provider-side idempotency.
- Physical-device or carrier-network diagnosis.
- Security review, battery measurements, or load/capacity tests for 500,000 concurrent users.
Do not treat the whole assessment as verified based only on this record. Re-run the commands and update this document if the code or results change.
