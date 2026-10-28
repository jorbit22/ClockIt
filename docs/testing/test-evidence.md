# Local Test Evidence

## Test Environment

- **Date:** 28 October 2026
- **Operating system:** Windows
- **Node.js:** v22.23.4
- **npm CLI:** 10.9.9
- **TypeScript:** 7.0.2
- **tsx:** 4.23.15

Verification covered automated tests, TypeScript typechecking, and the integrated console demonstration.

## Automated Tests

**Command**

```powershell
npm test
```

**Result:** 55 passed, 0 failed.

The test suite covers:

- Event creation and validation.
- Backend delivery state, leases, retries, expiry, dead-lettering, and phone-storage acknowledgments.
- Adaptive timeout estimation, heartbeat scheduling, reconnect backoff, outbox behavior, and simulated foreground protection.
- Transaction-intent handling, duplicate submissions, conflicting requests, uncertain execution outcomes, reconciliation, and outcome communication.
- Phone-to-watch relay delivery, duplicate handling, expiry, acknowledgment validation, and retries after a lost acknowledgment.
- Watch-interaction intent submission, duplicate-intent protection, conflicting parameters, expiry checks, and retrieval of existing intents.

These results establish the behavior exercised by the tests within the local TypeScript environment. They do not establish complete assessment compliance or production reliability.

## TypeScript Typecheck

**Command**

```powershell
npm run typecheck
```

**Result:** Completed successfully with no reported TypeScript errors.

## Integrated Demonstration

**Command**

```powershell
npm run demo
```

The demonstration completed successfully and produced the following results:

| Stage                    | Observed result                                   |
| ------------------------ | ------------------------------------------------- |
| Event creation           | Sample event created                              |
| Backend delivery         | Sent to two simulated devices                     |
| Phone acknowledgment     | Both records reached `PHONE_STORED`               |
| Phone-to-watch relay     | `ACKNOWLEDGED` after one attempt                  |
| Simulated watch storage  | One event stored                                  |
| Double-tap interaction   | Transaction intent accepted                       |
| Initial execution result | `OUTCOME_UNKNOWN` after a simulated lost response |
| Reconciliation           | Intent changed to `SUCCEEDED`                     |
| Execution count          | Remained at one                                   |
| Outcome communication    | `SUCCEEDED (SIMULATED_SUCCESS)`                   |
| Demonstration            | Completed                                         |

The transaction scenario demonstrates that the simulated processor can reconcile an uncertain result without making a second executor call. It does not prove exactly-once execution against a real payment provider.

The relay scenario demonstrates the tested acknowledgment and storage behavior in memory. It does not demonstrate communication with a physical smartwatch.

## Evidence Limitations

The implementation uses in-memory state and simulated transports and execution components. The recorded results do not establish:

- Recovery of pending work after process termination and restart.
- Real WebSocket, push-notification, Android lifecycle, or Bluetooth Low Energy behavior.
- Physical smartwatch communication or gesture detection.
- Production payment execution, authoritative ledger behavior, or provider-side idempotency.
- Reproduction or resolution of the reported mobile-network and device-specific failures.
- Production security, battery consumption, or capacity for 500,000 concurrent users.

The test suite, typecheck, and demonstration provide evidence for the behaviors exercised in their respective environments. Requirements involving physical devices, real networks, durable persistence, production financial infrastructure, and large-scale capacity remain unverified.
