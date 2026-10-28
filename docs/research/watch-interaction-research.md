# Watch Interaction Research

**Project:** Clockit — Real-Time Event-to-Transaction Streaming Infrastructure
**Component:** Watch interaction and transaction-intent initiation
**Stage:** 5 — Watch interaction
**Status:** Research documented; design, implementation, and verification pending
**Date:** 28 October 2026

## 1. Purpose

Research how a watch application can recognize an intentional user interaction, prevent accidental or repeated input from creating unintended actions, and pass an accepted interaction into the transaction-intent workflow.
This research establishes what the platform documentation supports. It does not establish that the interaction has been implemented or tested on a physical watch.

## 2. Scope and boundaries

This component covers:

- Recognizing the specified user gesture.
- Determining whether the current screen and application state permit the action.
- Rejecting invalid, stale, or ineligible interactions.
- Preventing one recognized interaction from creating multiple local intents.
- Giving the user feedback about what the application has accepted.
- Passing an accepted action to the transaction-intent component.
  This component does not own:
- Backend event creation or backend-to-phone delivery.
- Phone-to-watch transport and delivery acknowledgment.
- Backend transaction execution or financial authorization.
- Confirmation that a transaction succeeded.
  Recognizing a gesture is not the same as durably recording an intent, delivering it to the phone, or completing a transaction.

## 3. Official platform findings

### 3.1 A touchscreen double tap is a sequence of pointer events

**Documented fact:** Android's Jetpack Compose documentation defines a double tap as a pointer going down, up, down, and up. Compose provides `detectTapGestures` with an `onDoubleTap` callback for recognizing this gesture.
Sources:

- https://developer.android.com/develop/ui/compose/touch-input/pointer-input/tap-and-press
- https://developer.android.com/reference/kotlin/androidx/compose/foundation/gestures/package-summary
  **Practical implication:** If the assessment means two rapid touchscreen taps inside the watch application, a platform gesture detector may be suitable. We must not invent our own timing threshold before checking the target platform's supported behavior and testing it.
  **Unresolved question:** Does the assessment mean a touchscreen double tap, two taps on a particular control, or a physical/hardware gesture? These are different input mechanisms.

### 3.2 Prefer built-in interaction components when they meet the requirement

**Documented fact:** Android recommends using the highest-level interaction abstraction that meets the application's needs. Standard components such as buttons include interaction behavior and semantic information useful to accessibility services. Lower-level pointer handling provides more control but requires more responsibility from the application.
Source:

- https://developer.android.com/develop/ui/compose/touch-input/pointer-input/understand-gestures
  **Practical implication:** A normal button or supported combined-click interaction should be considered before writing a custom pointer-event handler. A custom detector is justified only if the required interaction cannot be represented correctly with a higher-level component.
  **Verification needed:** Confirm which interaction mechanism fits the actual assessment behavior and test it on the chosen watch platform.

### 3.3 Wear OS input capabilities vary by device

**Documented fact:** Wear OS devices have at least a power button. Some devices also expose multifunction hardware buttons or rotary input. Their availability and behavior depend on the device.
Sources:

- https://developer.android.com/training/wearables/user-input/physical-buttons
- https://developer.android.com/training/wearables/compose/rotary-input
- https://developer.android.com/training/wearables/wear-v-mobile
  **Practical implication:** Do not assume that every watch supports the same hardware controls. Do not interpret a double press of a hardware button as a touchscreen double tap.
  **Unresolved question:** The target watch model and input capabilities have not yet been established.

### 3.4 Accessibility must be considered when selecting the interaction

**Documented fact:** Android's gesture guidance explains that higher-level components provide semantic information and accessibility support that lower-level pointer handlers do not automatically provide to the same extent.
Sources:

- https://developer.android.com/develop/ui/compose/touch-input/pointer-input/understand-gestures
- https://developer.android.com/training/wearables/accessibility
  **Practical implication:** The interaction must remain understandable and operable for supported accessibility services. A custom gesture must not silently remove the standard control semantics that users rely on.
  **Verification needed:** Test the selected interaction with the relevant accessibility features on the target device.

## 4. Proposed behavioral questions to resolve in design

The platform documentation establishes input mechanisms; it does not define Clockit's business rules. The following are design questions, not verified existing behavior.

### 4.1 Eligibility

Before accepting a gesture, determine:

- Is the correct screen active?
- Is there an eligible event or action for the user to act on?
- Has that event expired or already been acted upon?
- Is another action already being processed?
- Does the user need to review details or explicitly confirm the action?
  The design must state which checks are performed locally and which require the phone or backend.

### 4.2 Accidental and repeated input

Consider these cases:

- One tap instead of two.
- Two taps that do not satisfy the platform's gesture-recognition rules.
- A valid gesture repeated several times.
- The user taps while a previous action is still being accepted.
- The UI is dismissed or the application is interrupted during handling.
- The application receives the same underlying event again after recovery.
  The design must distinguish suppressing duplicate local input from deduplicating a transaction intent across devices and services. A local gesture guard alone cannot guarantee that a financial action executes only once.

### 4.3 Feedback and uncertainty

The user needs feedback that reflects the actual state.
For example, recognizing a gesture may justify a message such as “Action received” only if the application has truly accepted the input. It does not justify “Payment successful.”
The final wording and states must distinguish, as applicable:

- Gesture recognized.
- Intent created or durably recorded.
- Intent sent to the phone.
- Phone acknowledgment received.
- Transaction outcome confirmed.
- Outcome unknown because communication was interrupted.
  The precise state names and acknowledgment boundaries must align with the existing relay and transaction-intent designs.

### 4.4 Stable identity

If one gesture creates a transaction intent, the intent needs a stable identity that remains unchanged across retries. A retry must not accidentally create a new logical intent.
The gesture component can request intent creation, but the intent-handling component must define identity, durable recording, acknowledgment, and duplicate handling. The backend must enforce transaction idempotency.

## 5. Failure cases requiring design and tests

| Scenario                                   | Risk to investigate                                    |
| ------------------------------------------ | ------------------------------------------------------ |
| Gesture is incomplete                      | An unintended action is accepted                       |
| Gesture is repeated quickly                | Multiple intents are created                           |
| User interacts while an action is pending  | Conflicting actions are accepted                       |
| UI or process is interrupted               | The user cannot tell whether the action was accepted   |
| Intent delivery is interrupted             | A retry creates a second logical intent                |
| An old event is acted upon                 | An expired or already-handled action is accepted       |
| Acknowledgment is delayed                  | The user repeats an action because feedback is missing |
| Accessibility changes the interaction path | The action becomes difficult or impossible to perform  |

These are planned failure scenarios, not observed defects.

## 6. Evidence status

| Claim or area                                                        | Current evidence status                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Compose supports touchscreen double-tap recognition                  | Documented in official Android documentation                |
| Higher-level Compose components provide useful interaction semantics | Documented in official Android documentation                |
| Wear OS input capabilities differ by device                          | Documented in official Android documentation                |
| Clockit's intended gesture is definitively identified                | Unresolved                                                  |
| The selected gesture behaves correctly on the target watch           | Unverified                                                  |
| Accidental and repeated input are handled correctly                  | Unverified                                                  |
| Gesture-to-intent integration works end to end                       | Unverified                                                  |
| Transaction execution is duplicate-safe                              | Must be verified at the transaction-intent/backend boundary |
| Physical-watch and accessibility tests have passed                   | No results established                                      |

No implementation, automated test, emulator test, or physical-device test result is claimed by this document.

## 7. Assessment-specific requirements

### 7.1 Required interaction

**Source:** REQ-ARCH-004, REQ-DIAG-003, REQ-TEST-003.

The assessment explicitly requires a double-tap action on the smartwatch to initiate the transaction-intent flow. The system must carry that intent through the phone relay to backend processing and communicate the resulting transaction outcome.

The double tap is a user interaction, not proof that the intent reached the phone or backend, and not proof that a transaction succeeded.

### 7.2 Latency investigation

REQ-DIAG-003 reports that double-tap intents sometimes take more than eight seconds to reach the backend.

The investigation must measure the stages separately wherever timestamps and diagnostic evidence permit:

1. The watch recognizes the double tap.
2. The watch creates or queues the intent.
3. The phone receives and acknowledges the intent.
4. The phone transmits the intent to the backend.
5. The backend receives and acknowledges the request.

These timestamps are proposed diagnostic measurements, not evidence that the current system already records them. The implementation must use consistent identifiers and timestamp definitions so the measurements can be correlated.

Backend receipt is not transaction completion. Backend processing and outcome communication require separate measurements under REQ-ARCH-004 and REQ-TEST-003.

### 7.3 Required failure and recovery behavior

Research and design must address:

- A repeated double tap while an earlier intent is pending.
- A phone-watch disconnection during intent delivery.
- A phone process interruption after the watch creates an intent.
- A network interruption after the phone sends the request but before acknowledgment.
- A backend transaction that completes while its outcome message is lost or delayed.
- An outcome that arrives after the watch has stopped waiting or has reconnected.

The system must preserve enough state to distinguish an untransmitted intent from a request whose execution status is uncertain. Retrying an uncertain request must not create a second transaction.

### 7.4 Verification boundary

REQ-TEST-003 requires testing from the watch double tap through backend processing and outcome communication, including interrupted requests, retries, duplicate delivery, and uncertain outcomes.

The current research contains no Clockit implementation measurements or physical-watch test results. The greater-than-eight-second delay is an assessment-reported symptom, not a locally reproduced result or confirmed diagnosis.

## 8. Questions to resolve before design approval

1. What exact gesture does the assessment require?
2. What watch platform and device are the target?
3. Is the required interaction possible using a standard platform component?
4. What screen and event states make the action eligible?
5. Does the action require a separate confirmation step?
6. When is the local interaction considered accepted?
7. How are repeated input and concurrent pending actions handled?
8. What feedback is shown when the phone is disconnected or the outcome is unknown?
9. Which component creates and persists the stable transaction-intent ID?
10. Which tests can run deterministically in simulation, and which require a real watch?

## 9. Conclusion

Official Android documentation supports several ways to recognize user input, including touchscreen double taps, standard clickable components, and device-specific hardware input. The correct choice depends on the exact assessment requirement and target device.
The next step is to resolve the gesture and state rules, then document the proposed component design. No implementation or successful behavior should be claimed until the relevant tests provide evidence.
