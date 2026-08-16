# PlanAround — Final Codex Pass

## Objective

Make the timetable-import review feel like part of PlanAround itself instead of a long data-entry form.

This should be the final product change before testing/recording.

Do not add features or redesign unrelated parts of the app.

## Preserve the Existing Flow

The current onboarding structure is already correct:

```text
Initial setup
→ import timetable
→ establish recurring teaching week
→ confirm ECTS
→ add recurring commitments
→ complete setup

Main Calendar
→ add one-off events
→ edit recurring events
→ change class attendance
→ update timetable
```

Keep all of that behaviour.

In particular:

- during onboarding, empty Calendar slots create recurring commitments only;
- date-specific events remain post-onboarding only;
- `Not going this week` and `Not going every week` remain post-onboarding controls;
- recurring commitments can still be edited during setup;
- `Update timetable` remains available after onboarding.

Do not rebuild these parts.

---

## Required Change: Visual Timetable Review

The current AI timetable review renders every extracted teaching session as a large repeated form:

```text
Teaching session 1
Module code
Module name
Day
Start
End
Type

Teaching session 2
...
```

Remove this review experience.

After AI extraction, immediately show the extracted sessions as a **draft weekly timetable using the existing in-app Calendar UI**.

The user should review the timetable visually rather than inspect a long list of forms.

### Intended Flow

```text
Upload timetable screenshot
→ AI extracts teaching sessions
→ draft sessions appear in the weekly Calendar
→ user visually checks the timetable
→ click a class to correct/delete it
→ click an empty slot or Add missing session to add a missing class
→ Confirm timetable
→ confirmed timetable remains as the normal Calendar
→ user adds recurring commitments such as work, gym and meals
→ Complete setup
```

There should not be a separate giant form-based review step between extraction and the Calendar.

---

## Draft Calendar Behaviour

Reuse the existing `WeeklyCalendar` wherever practical.

The draft timetable should use the same:

- Monday–Sunday layout;
- 08:00–22:00 time scale;
- day columns;
- time positioning;
- teaching-session card styling;
- desktop sizing.

Do not create a second unrelated timetable design.

AI-extracted sessions must remain **draft data only** until the user presses `Confirm timetable`.

Do not persist them into the confirmed timetable/localStorage before confirmation.

### Review Header

Keep the review controls compact.

Suggested structure:

```text
Review your timetable

We found 10 teaching sessions.
Check that the week looks correct before continuing.

[+ Add missing session]    [Confirm timetable]    [Discard]
```

Show AI warnings compactly if any exist.

Do not render one full form per teaching session.

---

## Editing a Draft Teaching Session

Clicking a teaching-session card in the draft Calendar should open a small editor/modal.

The editor should expose only:

- Module code
- Module name
- Day
- Start
- End
- Type
- Delete
- Save / Close

Reuse the existing app styling and modal patterns where sensible.

Editing the session should update the draft Calendar immediately.

Deleting the session should remove it from the draft immediately.

Do not save these edits to the confirmed timetable until `Confirm timetable`.

---

## Adding a Missing Teaching Session

Support both:

- `+ Add missing session`;
- clicking an empty part of the draft Calendar.

When an empty Calendar slot is clicked:

- preselect that day;
- preselect the clicked/snapped start time;
- default the end time to one hour later;
- open the same compact teaching-session editor.

The explicit `+ Add missing session` button may use sensible defaults such as Monday, 09:00–10:00.

Do not reintroduce a large inline form.

---

## Confirmation

Keep the existing validation and confirmation logic wherever possible.

`Confirm timetable` should:

1. validate the draft using the existing rules;
2. require necessary module identity fields before confirmation;
3. preserve existing warning/error handling;
4. convert/save the reviewed draft using the existing timetable-confirmation path;
5. return to the normal setup Calendar with those teaching sessions visible.

After confirmation, the user should continue with the existing:

```text
Step 2 · Add normal commitments
```

They should be able to click empty Calendar slots and add recurring activities such as:

- work;
- gym;
- meals;
- clubs;
- social activities;
- other recurring commitments.

The confirmed teaching timetable should remain visible while they do this.

---

## Important UX Requirement

The transition should feel like:

```text
AI created my timetable
→ I checked it visually
→ now I am filling out the rest of my normal week
```

It should **not** feel like:

```text
AI extracted data
→ I manually reviewed a database form
→ a different Calendar appeared later
```

The Calendar is the central interface.

---

## Files / Implementation Guidance

Start by inspecting:

- `components/TimetableReview.tsx`
- `components/SetupWorkspace.tsx`
- `components/WeeklyCalendar.tsx`
- existing timetable-analysis types/validation

Prefer the smallest safe change.

Likely approach:

- refactor `TimetableReview` into a visual Calendar-based review component;
- map `TimetableAnalysisEntry` draft entries into temporary Calendar entries for rendering;
- retain `TimetableAnalysisEntry[]` as the actual draft state;
- use stable temporary IDs/index mapping only for the review UI;
- reuse `CalendarSlot`/existing snapping behaviour for adding sessions;
- keep the existing `confirmReviewedTimetable` persistence/conversion path.

Only modify `WeeklyCalendar` if a small reusable capability is genuinely required.

Do not refactor the workload model, scheduler, AI analyser, Worker, storage model or post-onboarding Calendar.

---

## Do Not Change

Do not spend time on:

- new AI models;
- Worker architecture;
- Featherless configuration;
- generic PDF timetable support;
- mobile redesign;
- calendar-provider integrations;
- drag-and-drop;
- automatic replanning;
- accounts/database;
- assignment workflow redesign;
- Plan workflow redesign;
- documentation/README wording;
- unrelated styling changes.

The supplied deterministic sample-PDF fallback can remain exactly as it is.

---

## Acceptance Criteria

The change is complete when this works:

1. Reset PlanAround.
2. Upload a timetable screenshot.
3. Run AI analysis.
4. The result appears as teaching blocks in a draft weekly Calendar — not a long repeated form.
5. Click an extracted class and correct its details.
6. Delete a class if necessary.
7. Click an empty slot and add a missing teaching session.
8. Confirm the timetable.
9. The confirmed teaching blocks remain visible in the normal setup Calendar.
10. Add a recurring commitment such as Gym by clicking an empty Calendar slot.
11. Confirm ECTS and complete setup.
12. Post-onboarding one-off events and attendance controls still behave exactly as before.

Also verify:

- no extracted timetable data is persisted before confirmation;
- warnings/errors remain visible;
- Monday–Sunday remains visible at the intended desktop recording width;
- no accidental horizontal scrolling on the intended desktop layout;
- no regressions in existing Calendar event editing;
- no regressions in timetable replacement after onboarding.

---

## Verification

Run the existing project checks after the change:

```bash
npm run lint
npm test
npm run typecheck
npm run build
```

If the repository uses additional existing Worker/type checks in its normal CI, do not change them; allow the normal workflow to run after push.

Fix only failures caused by this change.

---

## Stop Point

Once the visual timetable review works and the existing checks pass, stop.

Do not use the remaining time or Codex usage for additional feature work or speculative cleanup.
