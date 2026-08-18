# HA2 Changes

New work built on top of the inherited HA1 baseline (see [`HA1_BASELINE.md`](HA1_BASELINE.md)).

## Compliance / baseline

**Status:** Implemented.

- Added an MIT `LICENSE` (copyright Jack Lee, 2026) and set `package.json` `license` to `MIT`.
- Stopped tracking `.DS_Store` files and added `.DS_Store` to `.gitignore`.
- Added `HA1_BASELINE.md` distinguishing inherited HA1 work from new HA2 work.
- Added this change log.

No application behaviour changed in this phase.

## Multi-week Calendar

**Status:** Implemented.

- Added `lib/calendarWeek.ts`: pure, tested helpers for Sunday-first Calendar week math (`getCalendarWeekStart`, `addCalendarWeeks`, `calendarDateForDay`) kept strictly separate from Monday-based attendance-week keys (`getMondayWeekKeyForDate`, `getMondayWeekKeyForDateKey`).
- `SetupWorkspace` now tracks `visibleCalendarWeekStart` as local view state (not persisted) with previous/today/next controls and a formatted date range, so Calendar can navigate weeks instead of only showing the current one.
- `WeeklyCalendar` shows the date number under each day heading and now asks `isEntrySkipped(entry, date)` per rendered date rather than a single global flag.
- Attendance actions ("Going", "Not going this week") and new-event/empty-slot defaults now derive the Monday-based week key from the *visible* week and the clicked date, not the real current week – so marking a class skipped while looking at a future week no longer affects today's week, and vice versa.
- Deterministic; no AI involvement.

## Study progress

**Status:** Implemented.

- Extended `StudyBlock` with an optional `completedAt` ISO timestamp; `undefined` means incomplete, so existing HA1 study blocks keep loading without any storage migration.
- Added `lib/studyProgress.ts`: pure helpers for block duration, completed/incomplete filtering, and completed minutes (overall and per task).
- `PlanWorkspace` now shows a "Mark complete" / "Completed" toggle on every generated session, a Progress summary (focused work, completed, remaining) clamped against legacy data, and correctly re-reads each session's live completion state from the `studyBlocks` store rather than the frozen result computed at generation time.
- `WeeklyCalendar` renders completed study blocks in a visually quieter style with a "Completed" detail, distinct from both an active study block and a normal commitment.
- `completedAt` is intentionally excluded from plan fingerprints (verified by test): marking work complete is progress, not a scheduling input, so it cannot stale a saved plan.
- Deterministic; no AI involvement. Regeneration is not yet progress-aware – that is Phase 4.

## Adaptive replanning

**Status:** Implemented.

- Added `lib/studyProgress.ts#calculateRemainingWorkload`: subtracts completed minutes from the deterministic workload per task (not globally), so a task finished ahead of schedule never offsets an unrelated task that still needs its full recommended time. Excess completed time clamps to zero rather than going negative; completed time for a task no longer present in the workload (an edited rubric) is simply ignored, not clawed back from another task.
- Added `lib/studyProgress.ts#replaceIncompleteBlocksForAssignment`: replaces only an assignment's incomplete study blocks, preserving its completed blocks and every other assignment's blocks untouched.
- `PlanWorkspace`'s single `generatePlan` action became `generateOrReplan`: it always schedules the *remaining* workload rather than the full one, which naturally covers first generation, a plain regenerate (nothing completed yet) and a true replan (some sessions done, only the rest gets rescheduled) with one code path instead of three.
- `lib/scheduler.ts#generateStudySchedule` now treats a same-assignment block as occupied time when it is completed (previously all same-assignment blocks were exempt, since the old model discarded and replaced every block on every generation). Discovered via interactive browser testing: without this, replanning could regenerate a new session at the exact same date/time/task as an already-completed one, producing a duplicate `StudyBlock` id that silently hid the completed session's status in the list. Reproducing this needs only a session dated ahead of "now" and marked complete early - not a contrived edge case.
- `lib/planSnapshot.ts#getReservableStudyBlocks` now excludes completed blocks: a finished session no longer reserves time away from a different assignment's plan.
- Stale-plan display now distinguishes completed history from obsolete incomplete work: while stale, only completed sessions remain visible (still counted, per the fingerprint-independence rule from the study-progress phase); incomplete stored sessions are hidden until the user explicitly replans.
- Added an explicit "All done" state (`PlanWorkspace`) for when the remaining workload reaches zero, rather than presenting a zero-required "on track" schedule as if it were an active one.
- Deterministic; no AI involvement.

## Plan-change explanations

**Status:** Implemented.

- Added `lib/planSnapshot.ts#getPlanChangeReasons`: compares the stored plan fingerprint against current inputs category by category (assignment, module workload, timetable, recurring commitments, dated commitments) rather than as an opaque string diff. Reuses the same snapshot shape `createPlanFingerprint` already produces, so comparisons stay order-insensitive wherever the snapshot already is. A malformed or unrecognised stored fingerprint falls back to the broadest reason instead of crashing.
- Added `lib/replanSummary.ts#summarizeReplan`: a pure, deterministic comparison of an assignment's incomplete StudyBlocks before and after a replan, matched by a semantic key (`taskId + date + start + end`) rather than block id, since ids can change with placement. Completed blocks are excluded from both sides - they're history, not something that was replanned. Rescheduled time is reported conservatively as the smaller of removed-work and added-work minutes, never claiming a specific old session "moved to" a specific new one.
- The stale-plan banner now names what actually changed (e.g. "Reason: Recurring commitments changed") instead of a generic "your inputs changed."
- After a regenerate or replan, a "Plan updated" summary shows how many sessions were replaced, how much remaining time was rescheduled, the same change reasons, and the resulting schedule status - or, when the fingerprint changed but no session placement did, says so explicitly rather than inventing movement. Shown only for a regenerate/replan; a first-time "Generate plan" has no prior plan to compare against, so no summary is shown. Component state only, reset on assignment switch; nothing new persisted to localStorage.
- Deterministic; no AI involvement, per the phase's explicit no-AI-for-explanations rule.

## Documentation / deployment

**Status:** Not yet implemented.
