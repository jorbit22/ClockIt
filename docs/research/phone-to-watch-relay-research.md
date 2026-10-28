# Phone-to-Watch Relay Research

**Project:** Clockit — Real-Time Event-to-Transaction Streaming Infrastructure
**Component:** Phone-to-watch relay
**Status:** Research documented; implementation and verification pending
**Date:** 28 October 2026

## 1. Purpose

The phone-to-watch relay is the communication boundary between the Android phone and the smartwatch.

The phone receives events from the backend. The relay must transfer relevant events to the watch so that the watch can present them to the user and, where required, return a user's transaction intent to the phone.

The relay must not confuse these different outcomes:

- The phone attempted to send an event.
- The watch received the event.
- The watch validated and durably stored the event.
- The watch displayed the event.
- The user interacted with the event.
- The backend executed a transaction.
- The user received a confirmed transaction outcome.

Success at one step does not establish success at a later step.

## 2. Research questions

This research investigates:

1. Which phone-to-watch communication mechanisms are available?
2. What do pairing and connection status actually guarantee?
3. What happens when either device disconnects or its application process dies?
4. How can the relay detect successful receipt rather than merely successful transmission?
5. How should it handle repeated delivery and interrupted communication?
6. How must the relay preserve the distinction between event delivery and transaction execution?

## 3. Evidence from official platform documentation

### 3.1 Android Bluetooth Low Energy and GATT

**Source:** Android Developers, Bluetooth Low Energy overview
https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview

**Verified facts**

Android BLE communication can use the Generic Attribute Profile (GATT). One device acts as a GATT client that requests data or operations, while the other acts as a GATT server that provides them.

Android's documentation describes an example in which the phone acts as the GATT client and a BLE peripheral acts as the GATT server. The roles can be arranged differently when the design requires it.

**Engineering implications**

- The implementation must establish which device acts as the GATT client and which provides the required service.
- The relay needs an agreed service and characteristic contract for the event data and any acknowledgment messages.
- Connection establishment alone does not prove that an application event was received or stored.
- The application protocol must define message identity, validation, acknowledgment, and recovery.

**Unresolved questions**

- Is the target smartwatch a generic BLE peripheral or a Wear OS device?
- Which device will host the event service?
- What message size, payload format, and acknowledgment behavior does the target platform support?

### 3.2 Sending and receiving BLE data

**Source:** Android Developers, Transfer BLE data
https://developer.android.com/develop/connectivity/bluetooth/ble/transfer-ble-data

**Verified facts**

Android's BLE guidance describes connecting to a GATT server, discovering its services and characteristics, and using supported characteristics to read, write, or receive notifications.

The connection callback reports connection-state changes. Service discovery is a separate operation after connection.

**Engineering implications**

The relay should treat these as separate milestones:

1. A Bluetooth connection exists.
2. The expected service and characteristics are discovered.
3. The event transfer is attempted.
4. The watch application validates the event.
5. The watch commits the event to its own storage, if durable receipt is required.
6. The watch returns an application-level acknowledgment.

The final acknowledgment must be defined by the application protocol. A successful Bluetooth operation or characteristic write should not automatically be treated as proof that the watch has safely stored the event.

**Unresolved questions**

- Which BLE write mode will be used?
- What acknowledgment response will the watch send after validating and storing an event?
- How will the relay handle partial, malformed, or repeated messages?
- What happens when the connection fails while an event is being transferred?

### 3.3 Pairing does not guarantee an active connection

**Source:** Android Developers, Companion device pairing
https://developer.android.com/develop/connectivity/bluetooth/companion-device-pairing

**Verified facts**

Android's companion-device pairing mechanism can help users select and associate nearby devices. The documentation explicitly states that pairing does not itself establish a connection or enable continuous scanning.

The application still needs to use the relevant connectivity APIs to establish and manage communication.

**Engineering implications**

The relay cannot use “watch paired” as proof that the watch is currently reachable.

It needs distinct state for:

- Device association.
- Connection establishment.
- Connection readiness.
- Transfer in progress.
- Application acknowledgment received.
- Disconnection and recovery.

**Unresolved questions**

- How will the relay detect that the watch is no longer reachable?
- Which Android lifecycle mechanism will initiate reconnection?
- How will the relay avoid repeatedly attempting connections when the watch is out of range?

### 3.4 BLE connections and Android process death

**Source:** Android Developers, Communicate in the background
https://developer.android.com/develop/connectivity/bluetooth/ble/background

**Verified facts**

Android documents that BLE connections can be used while an application is in the background, but the connection is closed if the application's process is killed. Android also restricts background activity launches and foreground-service starts under relevant platform conditions.

The documentation describes mechanisms such as WorkManager and foreground services, subject to their respective restrictions.

**Engineering implications**

The relay must not rely solely on an in-memory connection or an in-memory list of events.

If the phone process dies, the system may lose the active connection and any pending state held only in memory. Recovery therefore needs to re-establish the connection and recover unacknowledged work from a suitable store.

A foreground service may help with long-running work, but it is not proof that the process will always survive.

**Unresolved questions**

- Which lifecycle mechanism will the implementation use?
- Which event and transaction-intent records must survive process death?
- What recovery behavior is expected after the phone application restarts?
- How will the implementation be tested under process death and background restrictions?

### 3.5 Wear OS Data Layer is a separate option

**Source:** Android Developers, Overview of Data Layer API
https://developer.android.com/training/wearables/data/overview

**Verified facts**

Google's Wear OS Data Layer API provides communication and synchronization between Wear OS watches and paired Android phones. It is available for Wear OS watches paired with Android devices.

Google advises applications to use the Data Layer API for communication specifically between the local phone and watch, rather than opening their own low-level sockets for that purpose.

The API supports different communication patterns, including messages and synchronized data items.

**Source:** Android Developers, Sync data using the Wear OS Data Layer API
https://developer.android.com/training/wearables/data/sync

Google documents that data items can be set while devices are disconnected and synchronized when connectivity becomes available. It also states that the Data Layer is not itself a substitute for application-owned storage.

**Engineering implications**

If Clockit's target is Wear OS, the Data Layer may be a better-supported communication mechanism than a custom low-level BLE protocol.

However, its availability does not automatically satisfy Clockit's application-level requirements. The implementation must still define event identity, freshness, durable application state, acknowledgment semantics, duplicate handling, and transaction-intent recovery.

If the target is a different smartwatch platform, these Wear OS-specific recommendations may not apply.

**Unresolved questions**

- Is Wear OS the required watch platform?
- Does the assessment require direct BLE implementation, or does it permit the platform's supported phone-to-watch API?
- Which Data Layer client type or communication pattern would satisfy the required latency and recovery behavior?

The Wear OS Data Layer's delivery timing must be evaluated against the event's urgency requirement. Google documents that non-urgent data items may be delayed by up to 30 minutes; urgent synchronization can be requested with `setUrgent()`. Therefore, the Data Layer must not be assumed to provide immediate delivery by default. The application must also maintain its own required durable state rather than treating the Data Layer as its storage system.

The Data Layer exposes different communication patterns. `DataClient` is intended for persistent data-item synchronization, while `MessageClient` sends messages to a connected node. The Data Layer can use Bluetooth or, when available, a network path through Google's servers. The eventual design must select the communication pattern based on whether the requirement is persistent synchronization or prompt delivery to a connected watch, and must verify the actual delivery and acknowledgment behavior required by the assessment.

Google's client comparison documents a material reliability difference: `MessageClient` does not provide persistence or automatic retry and requires connected nodes, while `DataClient` persists data items and synchronizes them when connectivity is re-established. Therefore, if the design uses `MessageClient` for prompt delivery, the application must provide its own durable pending-item state and retry behavior. If it uses `DataClient`, the application must still maintain its own storage and define application-level receipt acknowledgment, deduplication, expiry, and transaction-intent handling.

## 4. Cross-device delivery contract

The following is a **proposed engineering contract**, not a claim that the platform automatically provides these guarantees.

### 4.1 Event identity

Each event should carry a stable event ID assigned upstream. The same logical event must retain the same ID when retried.

The watch should use that ID to recognize repeated delivery. Receiving the same event twice should not create two independent logical events.

The relay should not create a new event identity merely because a transfer timed out.

### 4.2 Receipt acknowledgment

The protocol should distinguish:

- **Transfer attempted:** the phone initiated a send operation.
- **Transport operation completed:** the Bluetooth or platform API reported the relevant operation's completion.
- **Application receipt acknowledged:** the watch application confirmed that it validated and accepted the event.
- **Durable receipt acknowledged:** the watch confirmed that the event was committed to the storage required by the design.

For reliable recovery, the phone should only mark an event as durably delivered when it receives the acknowledgment defined by the application contract.

The exact acknowledgment boundary must be selected in the design.

### 4.3 Duplicate delivery

If the phone sends an event but its acknowledgment is lost, the phone cannot safely conclude that the watch never received the event.

The phone may need to retry. Therefore, the watch should recognize repeated event IDs and avoid creating duplicate logical entries.

The watch should be able to acknowledge a recognized duplicate without treating it as a new event.

### 4.4 Interrupted delivery

If the connection drops during a transfer, the relay must treat the outcome as uncertain unless the protocol provides sufficient evidence to establish otherwise.

The relay should retain the event as pending until the required acknowledgment is received or a documented terminal policy applies.

On reconnection, it should retry eligible pending events using their original IDs.

The exact retry policy, expiry rules, and storage mechanism remain design decisions.

### 4.5 Transaction intents are different from events

A watch event informs the user. A transaction intent requests an action.

When the user double-taps the watch, the application should create or submit a uniquely identified transaction intent. Repeated delivery of that intent must not cause repeated financial execution.

The relay can preserve and retransmit an intent, but it cannot guarantee exactly-once transaction execution by itself. That requires backend enforcement of idempotency and a separate transaction outcome contract.

The watch must not report a transaction as successful merely because the intent was sent or acknowledged by the phone.

## 5. Failure scenarios that the relay must address

| Failure                                                      | What is known                                        | Required design consideration                                    |
| ------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Watch is paired but disconnected                             | Association exists; communication is not established | Detect unavailable connection and retain eligible pending events |
| Watch moves out of range                                     | Current transfer may fail or connection may be lost  | Preserve event identity and recover after reconnection           |
| Phone process dies                                           | Active connection and in-memory state may be lost    | Recover pending work from persistent storage where required      |
| Watch receives an event but its acknowledgment is lost       | Receipt is uncertain from the phone's perspective    | Retry safely using the same event ID                             |
| Watch receives the same event more than once                 | Duplicate delivery has occurred                      | Deduplicate using stable event identity                          |
| Connection fails during transfer                             | Complete application receipt is not established      | Treat the outcome as uncertain and follow the retry protocol     |
| Watch receives a stale event                                 | Receipt alone does not make the event actionable     | Check expiry, current state, and authorization before acting     |
| Transaction intent is delivered more than once               | Multiple copies of one logical request may exist     | Preserve intent identity and require backend idempotency         |
| Transaction completes but its outcome cannot reach the watch | Execution and user notification have diverged        | Retrieve or reconcile the authoritative transaction outcome      |

## 6. Verification requirements

The following tests are proposed. They have not yet been executed.

1. Deliver one event over the selected transport and verify that the watch application validates it.
2. Verify that the watch acknowledges the event only at the agreed receipt boundary.
3. Drop the connection before acknowledgment and verify that the phone retains the event.
4. Reconnect and verify that the pending event is retried with its original ID.
5. Deliver the same event repeatedly and verify that the watch does not create duplicate logical entries.
6. Kill the phone process and verify the documented recovery behavior.
7. Kill or restart the watch application and verify the documented recovery behavior.
8. Interrupt a transaction-intent transfer and verify that retrying does not create a new logical intent.
9. Verify that phone-to-watch receipt does not get reported as transaction execution success.
10. Test stale-event handling and confirm that an expired event cannot authorize a transaction.
11. Record timestamps and identifiers across event creation, phone receipt, watch receipt, acknowledgment, transaction execution, and final outcome communication.
12. State clearly whether each result came from a deterministic simulation, an emulator, a physical device, or a real network/device environment.

## 7. Open decisions before design

The following questions must be resolved or explicitly retained as assumptions:

1. What watch platform and device are in scope?
2. Is the required implementation raw BLE GATT, Wear OS Data Layer, or an abstraction that supports a simulated transport first?
3. Which device hosts the communication service?
4. What exact message and acknowledgment schemas are required?
5. What is the durable receipt boundary?
6. What event and intent data must survive process death on each device?
7. What are the event expiry and pending-item retention policies?
8. How should the relay prioritize fresh events over old or expired events?
9. What reconnection and retry limits are appropriate?
10. Which Android versions and watch devices will be used for verification?

## 8. Research conclusion

Official Android documentation establishes that BLE GATT is a supported mechanism for exchanging data between compatible devices, that companion-device pairing does not itself establish an active connection, and that process death can close an existing BLE connection. Google's documentation also establishes a platform-specific alternative for Wear OS phone-to-watch communication through the Data Layer API.

Neither a Bluetooth connection nor a successful transport operation, by itself, establishes that an application event was durably accepted by the watch or that a financial transaction was executed.

The relay design must define those boundaries explicitly.

**Research status:** Official platform behavior documented. Target watch platform, communication mechanism, application protocol, implementation, and test results remain unresolved or unverified.

## 9. References

1. Android Developers — Bluetooth Low Energy overview: https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview
2. Android Developers — Transfer BLE data: https://developer.android.com/develop/connectivity/bluetooth/ble/transfer-ble-data
3. Android Developers — Companion device pairing: https://developer.android.com/develop/connectivity/bluetooth/companion-device-pairing
4. Android Developers — Communicate in the background: https://developer.android.com/develop/connectivity/bluetooth/ble/background
5. Android Developers — Overview of Data Layer API: https://developer.android.com/training/wearables/data/overview
6. Android Developers — Sync data using the Wear OS Data Layer API: https://developer.android.com/training/wearables/data/sync
7. Android Developers — Sync data items with the Data Layer API: https://developer.android.com/training/wearables/data/data-items
8. Android Developers — Choose a client type: https://developer.android.com/training/wearables/data/client-types
