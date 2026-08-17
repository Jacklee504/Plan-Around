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

**Status:** Not yet implemented.

## Plan-change explanations

**Status:** Not yet implemented.

## Documentation / deployment

**Status:** Not yet implemented.
