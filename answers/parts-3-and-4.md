# Parts 3 & 4 — Debugging & Trade-offs

## Part 3: Debugging & Edge Cases

These answers are grounded in the research documented in `docs/research/` and the
behaviour already implemented in `src/connection-manager/adaptive-connection-manager.ts`.

---

### Symptom 1 — Heartbeats succeed for 2–3 minutes, then the connection silently dies

**Most likely root cause**

The carrier's NAT table is flushing idle TCP mappings at roughly the 2–3 minute mark.
MTN Nigeria and Airtel Nigeria are known to flush NAT entries after as little as 90–180
seconds of silence on a TCP connection. The WebSocket sits on top of TCP. When the NAT
mapping is gone, packets from the server can no longer reach the phone. Neither side
sends a close frame — the socket appears open on both ends but is actually dead. The
next heartbeat sent by the phone gets no response because the return path no longer
exists.

A secondary cause to rule out: Android Doze kicking in and deferring the heartbeat
timer. If the device goes idle, the scheduled heartbeat fires late, the connection dies
in the gap, and the log shows "2–3 minutes" simply because that is when Doze first
activates.

**Diagnostic data to add**

- Log the exact wall-clock time each heartbeat is *scheduled* and the time it actually
  *fires*. A gap between the two reveals timer deferral by Doze or the OEM scheduler.
- Log the WebSocket close code when the connection drops. Code 1006 (abnormal closure,
  no close frame received) is the fingerprint of a silently dead NAT mapping.
- Log the last successful heartbeat RTT and the idle duration immediately before the
  drop. If idle duration ≈ NAT timeout, the cause is confirmed.
- Record the Android network type (2G / 3G / 4G / Wi-Fi) and operator at the moment of
  drop. Different operators flush NAT at different intervals.
- Track `consecutiveConnectionFailures` from `getMetrics()` alongside timestamps so the
  pattern is visible in aggregate across devices.

**Concrete changes to the connection manager and watch relay**

1. **Lower the safety margin.** The current `AdaptiveConnectionManager` targets
   70–85 % of the learned timeout. On Nigerian carriers where NAT flushes at ~120 s,
   85 % gives a heartbeat at ~102 s — still too close. Start the initial estimate at
   60 s (`initialIdleTimeoutMs: 60_000`) and let the EMA learn downward from there.
   The first observed disconnect updates the estimate via `observeIdleDisconnect()`.

2. **Protect the heartbeat timer from Doze.** On Android, the heartbeat `setTimeout`
   must be backed by a `setExact` or `setExactAndAllowWhileIdle` `AlarmManager` alarm
   inside a foreground service, not a plain JS timer. Plain timers are deferred when
   Doze activates. This is a phone-side implementation concern; the TypeScript class
   models the scheduling logic — the Android layer must honour the deadline.

3. **Send a BLE liveness signal from the watch on every user interaction.** Any wrist
   movement or button press can reset the idle timer on the phone side, delaying the
   next heartbeat and reducing unnecessary pings during active use.

---

### Symptom 2 — After process death, events are delayed 4–15 minutes

**Most likely root cause**

The phone app process was killed by Android or the OEM battery manager. Two recovery
paths exist, and both are slow in practice on African carriers:

- **FCM wake-up path:** The backend sends a high-priority FCM message to wake the app.
  On MTN/Airtel Nigeria, FCM high-priority delivery to idle devices commonly takes
  4–15 minutes due to Doze maintenance windows and carrier-level push gateway delays.
  This matches the observed range exactly.
- **No wake-up path:** If FCM is not configured, the app simply stays dead until the
  user opens it manually.

The outbox in `AdaptiveConnectionManager` is in-memory. When the process dies, the
outbox is lost. Events that had not yet been acknowledged at the backend are not
replayed on restart because the phone has no record of what it missed.

**Diagnostic data to add**

- Log app process start time and the reason for startup (user launch vs FCM wake vs
  system restart). This distinguishes "killed and woke up via FCM" from "killed and
  nobody noticed".
- Log the FCM message receipt timestamp versus the event's `occurredAt` timestamp. The
  delta is the actual FCM delivery latency for that device and carrier.
- Log the backend's oldest unacknowledged delivery record for that device at the time
  the phone reconnects. This shows how much was missed.
- Record the Android battery optimisation state at the time of kill. This separates
  standard Doze kills from OEM-specific kills (see Symptom 4).

**Concrete changes**

1. **Persist the outbox to disk.** The current outbox uses an in-memory `Map`. It must
   survive process death. Write each enqueued item to a local SQLite row or append-only
   JSON file immediately on `enqueue()`. Delete the row only after `acknowledge()` is
   called. On restart, read the file and re-enqueue any unacknowledged items. This is
   the same pattern used in the payment outbox you already know from wallet engines.

2. **Request the "missed events" window on reconnect.** After reconnecting, the phone
   should send the backend its last acknowledged event timestamp. The backend delivery
   service (already designed in `docs/design/backend-event-delivery.md`) can then
   replay unacknowledged events from its durable delivery records. The phone does not
   need to remember what it missed — the backend does.

3. **Use FCM as a targeted wake signal, not as the event carrier.** The FCM message
   body should say "reconnect now — you have missed events." The actual events travel
   over the WebSocket after reconnection. This keeps FCM payloads small and avoids the
   10-minute Doze deferral that affects normal-priority data messages.

---

### Symptom 3 — Double-tap intents sometimes take more than 8 seconds to reach the backend

**Most likely root cause**

Three delays compound:

1. **BLE reconnection (2–4 s).** If the watch and phone Bluetooth link went idle, it
   must re-pair before the intent can cross from watch to phone. BLE reconnection on
   Android typically takes 1–4 seconds depending on the device and proximity.

2. **Phone WebSocket reconnection (1–5 s).** If the phone's backend connection died
   silently (see Symptom 1), the connection manager is in reconnect-wait state when the
   tap arrives. The tap is correctly queued in the outbox via `enqueue()`, but it waits
   for the backoff delay to expire and the new connection to be established before
   `flushOutbox()` can send it.

3. **Network round-trip on 2G/3G (1–3 s).** On EDGE or HSPA, a single request/response
   can take 1–3 seconds even when the connection is healthy.

In the worst case all three stack: 4 s BLE + 4 s reconnect + 2 s network = 10 s.

**Diagnostic data to add**

- Timestamp the double-tap at the *watch* the moment it is detected.
- Timestamp BLE transfer start and BLE transfer complete on the phone side.
- Timestamp `enqueue()` call and `flushOutbox()` attempt in `AdaptiveConnectionManager`.
- Timestamp the HTTP/WebSocket send and the server acknowledgement receipt.
- Log whether the connection was already `CONNECTED` or was in `RECONNECT_WAIT` at the
  moment the tap arrived. This is the single most useful split — it separates the "slow
  network" case from the "dead connection" case.

**Concrete changes**

1. **Keep the BLE link alive with a low-power liveness ping from the watch.** Send a
   1-byte BLE notification every 30 seconds to prevent the link from going idle. This
   eliminates the BLE reconnection delay for most taps.

2. **Reduce the reconnect backoff for the first attempt.** The current implementation
   uses `reconnectBaseMs: 1000` and doubles from there. For the first failure only,
   drop the base to 200 ms. A user who just double-tapped should not wait a full second
   for the first reconnect attempt. Subsequent attempts keep the exponential schedule.

3. **Trigger an immediate connection check on BLE activity.** When the phone receives
   any signal from the watch (a liveness ping or an intent), it should immediately
   verify the backend connection is healthy rather than waiting for the next scheduled
   heartbeat. If the connection is dead, start reconnecting before the intent is even
   fully decoded.

---

### Symptom 4 — Transsion devices show the foreground notification but still freeze after ~1 minute

**Most likely root cause**

Transsion devices (Tecno, Infinix, itel) run a proprietary battery manager called
**HiOS / XOS Power Genius** that operates *independently* of Android's standard
foreground service system. It maintains its own whitelist of "protected" apps. An app
that Android considers protected (because it has a foreground service and a visible
notification) can still be frozen or killed by HiOS/XOS if it is not on the Transsion
whitelist.

This is documented OEM behaviour. The foreground notification proves the Android layer
is satisfied — it does not prove the Transsion battery manager is satisfied. The two
systems are independent. This is why the notification is visible but the process still
freezes.

**Diagnostic data to add**

- Log app heartbeat timestamps server-side per device ID. A Transsion device that stops
  sending heartbeats exactly at ~60 s intervals, regardless of network conditions,
  confirms OEM-level freezing rather than a network issue.
- Log device manufacturer, model, and OS build (`Build.MANUFACTURER`, `Build.MODEL`,
  `Build.VERSION.RELEASE`) at connection time. This lets you segment "Transsion freeze"
  reports from genuine network drops in your analytics.
- Log whether the app received *any* CPU time (a simple counter incremented every
  second) so you can distinguish "app was frozen" from "app was running but connection
  died."

**Concrete changes**

1. **Request Transsion battery optimisation exemption explicitly.** On HiOS/XOS devices,
   the app must request `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` and additionally
   guide the user to add the app to the device's own "Protected Apps" or "Auto-start"
   list. This is a one-time setup step, not an automatic entitlement. Display a
   one-time prompt to the user the first time Clockit connects on a Transsion device.

2. **Use a WorkManager `PeriodicWorkRequest` as a dead-man's switch.** Schedule a
   periodic job every 15 minutes. If the foreground service is killed by HiOS/XOS, the
   WorkManager job detects the absence of a live connection on its next run and
   restarts it. WorkManager is more resistant to OEM killers than bare foreground
   services because it integrates with the system job scheduler.

3. **Register for FCM high-priority messages as a fallback wake.** If the foreground
   service is frozen, an incoming FCM high-priority message can trigger a limited
   processing window on some Transsion firmware versions. Use this to restart the
   connection manager even if the service was killed.

---

## Part 4: Trade-offs & Senior Judgement

---

### Question 1 — Persistent foreground service vs high-priority FCM + watch push: when do you choose which?

**Choose a persistent foreground service when:**

- The product requires delivery latency under 3 seconds. Flash sales and stop-loss
  triggers fall here. A user who misses a 10-second window because FCM took 4 minutes
  has been failed by the product.
- The event carries a transaction intent. You need the outbox alive in memory, the
  connection healthy, and the BLE relay warm. None of these are possible if the process
  is dead waiting for FCM.
- The user has explicitly opted into real-time alerts and has been shown why the
  persistent notification is there. Transparency reduces the user deleting the app
  because of the notification icon.

**Choose FCM + watch push when:**

- Delivery within 5–15 minutes is acceptable. Informational alerts — weekly summaries,
  marketing messages, non-urgent price updates — do not justify the battery cost of a
  permanent connection.
- The device is a low-end Transsion or Infinix model where the foreground service will
  be killed anyway. On those devices, FCM is your real primary channel whether you like
  it or not. Design for it explicitly rather than pretending the foreground service is
  reliable.
- The user is inactive. If no tap has come from the watch in 30 minutes, drop back to
  FCM-only mode and kill the foreground service. Reconnect when FCM wakes the app.

**The right production answer is both, with an adaptive mode switch.** Keep the
foreground service while the user is active (recent tap, app in foreground, or trading
hours). Switch to FCM-only when the user is idle. This is the same pattern used by
WhatsApp and most production African fintech apps.

---

### Question 2 — How do you balance battery impact against delivery reliability?

The `AdaptiveConnectionManager` already encodes the right answer: **measure first,
then tune.**

The EMA estimator learns the real NAT timeout from observed disconnects via
`observeIdleDisconnect()`. The heartbeat is scheduled at 70–85 % of that learned
value with jitter via `getHeartbeatDelayMs()`. This means the phone does not ping
more often than the network actually requires. On a network where the NAT holds for
5 minutes, heartbeats go out every ~3.5 minutes — not every 30 seconds.

Three rules govern the balance in practice:

1. **Never heartbeat more than the network requires.** Let the EMA learn the real
   timeout. Do not hardcode a 30-second interval because "that is what we always do."
   On a healthy LTE connection, the NAT may hold for 10 minutes. Pinging every 30
   seconds on that network wastes battery for no benefit.

2. **Protect the connection only when it earns its keep.** During active trading hours
   or when a flash sale is live, reliability wins. During the user's sleeping hours,
   battery wins. Switch modes based on time of day and user activity signals.

3. **Never hold a wake lock longer than one heartbeat round-trip.** Acquire it, send
   the ping, receive the pong, release it. A permanent wake lock is not a connection
   strategy — it is a battery drain that will get the app uninstalled.

The unresolved question — which no design document can answer — is what the real EMA
value stabilises at on MTN Lagos vs Safaricom Nairobi. That requires field measurement
on those networks, not a simulation. The `getMetrics()` method exposes
`learnedIdleTimeoutMs` specifically so that field data can be collected and fed back
into the initial configuration.

---

### Question 3 — Should the smartwatch ever maintain its own upstream connection? Why or why not?

**No, not as the primary path. Conditionally yes, as a fallback for specific scenarios.**

The reasons against making it primary:

- Most smartwatches in the African market that Clockit targets are Bluetooth-only. They
  have no independent cellular or Wi-Fi radio. Direct connectivity is simply not
  available on those devices.
- Wear OS watches that do have Wi-Fi route their traffic through the paired phone by
  default to save battery. Opening an independent backend connection burns the watch
  battery meaningfully faster.
- Two independent connections mean two independent connection managers, two outboxes,
  two sets of reconnect logic, and two potential sources of duplicate transaction
  intents. The idempotency burden on the backend doubles. The complexity cost is
  disproportionate to the benefit.

The case for a conditional fallback:

- If the phone is completely unreachable (dead battery, out of BLE range) and the watch
  has independent LTE or Wi-Fi, it makes sense to allow the watch to submit a queued
  intent directly. The intent ID is already stable — it was generated at tap time. The
  backend can deduplicate it whether it arrives from the phone or the watch.
- This is a feature to ship in v2, after the phone relay path is proven. It should not
  be in the initial architecture because it adds complexity before you know whether the
  phone relay path is insufficient.

**Decision: phone relay is primary. Direct watch connectivity is a defined fallback,
gated on the watch having an independent radio and the phone being unreachable for more
than N seconds.**

---

### Question 4 — How would you evolve this system to support 500,000 concurrent users on mixed 2G/3G/4G with heavy OEM restrictions?

The answer is not one big change. It is five independent problems solved separately.

**1. Connection fan-out: horizontal WebSocket scaling**

A single Node.js process cannot hold 500,000 WebSocket connections. Use a WebSocket
gateway tier (Socket.IO with Redis adapter, or a dedicated broker like EMQX) behind a
load balancer. Each gateway node holds ~10,000–50,000 connections. At 500k users, that
is 10–50 nodes. Redis pub/sub routes a backend event to whichever gateway node holds
the target device's connection. This is the standard pattern used by Pusher, Ably, and
every production WebSocket product.

**2. Reconnect storm protection**

When a shared infrastructure outage clears and 500,000 phones try to reconnect
simultaneously, the reconnect traffic alone can re-trigger the outage. The
`AdaptiveConnectionManager` already uses exponential backoff with jitter in
`recordReconnectAttempt()`. At scale, add a server-side reconnect token: the backend
tells each reconnecting client a jittered reconnect window. Clients that ignore it are
rate-limited at the gateway.

**3. Tiered delivery by network quality**

On 2G (EDGE, ~100 kbps), a WebSocket connection with frequent heartbeats is expensive.
Segment the fleet by network type using `setNetwork()` in the connection manager.
2G devices get a longer heartbeat interval, smaller payloads, and FCM as primary
delivery. 4G devices get the full real-time streaming path. The `networkMultiplier`
already in `recordReconnectAttempt()` is the seed of this logic — extend it to
heartbeat scheduling too.

**4. Outbox durability at scale**

The current outbox is in-memory. At 500k users, process restarts happen constantly.
Every restart that loses an in-memory outbox becomes a missed event. Persist the outbox
to a local SQLite database on the phone (one row per unacknowledged intent, deleted on
ACK). This is the same transactional outbox pattern used in payment systems — write the
intent to the local DB and the network in the same logical operation, never trust
only the network.

**5. OEM restriction fleet management**

At 500k devices, Transsion/Infinix will be a significant fraction of the fleet —
possibly 30–40% given their market share in Nigeria and Kenya. Build a device profile
in the backend: model, manufacturer, OS version, last heartbeat time, average heartbeat
gap. Devices that show the Transsion freeze pattern (heartbeats stop at exactly 60-
second intervals) get automatically enrolled in the FCM-primary delivery mode. This
requires no user action and degrades gracefully rather than silently failing.
