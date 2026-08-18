# Changes

New work built on top of the inherited baseline (see [`BASELINE.md`](BASELINE.md), which lists exactly what the original project already provided: AI timetable/assignment extraction, deterministic workload, deterministic initial scheduling, stale-plan fingerprints, multi-assignment reservation). Everything below is new work, deterministic unless stated otherwise.

## Compliance / baseline

**Status:** Implemented.

- Added an MIT `LICENSE` (copyright Jack Lee, 2026) and set `package.json` `license` to `MIT`.
- Stopped tracking `.DS_Store` files and added `.DS_Store` to `.gitignore`.
- Added `BASELINE.md` distinguishing inherited work from new work.
- Added this change log.
- Files: `LICENSE`, `package.json`, `.gitignore`, `BASELINE.md`, `CHANGES.md`.

No application behaviour changed in this phase. Why it matters: this project builds on a pre-existing repository, so open-source and provenance hygiene has to be right before any new feature work is credible.

## Multi-week Calendar

**Status:** Implemented.

- Added `lib/calendarWeek.ts`: pure, tested helpers for Sunday-first Calendar week math (`getCalendarWeekStart`, `addCalendarWeeks`, `calendarDateForDay`) kept strictly separate from Monday-based attendance-week keys (`getMondayWeekKeyForDate`, `getMondayWeekKeyForDateKey`).
- `SetupWorkspace` now tracks `visibleCalendarWeekStart` as local view state (not persisted) with previous/today/next controls and a formatted date range, so Calendar can navigate weeks instead of only showing the current one.
- `WeeklyCalendar` shows the date number under each day heading and now asks `isEntrySkipped(entry, date)` per rendered date rather than a single global flag.
- Attendance actions ("Going", "Not going this week") and new-event/empty-slot defaults now derive the Monday-based week key from the *visible* week and the clicked date, not the real current week – so marking a class skipped while looking at a future week no longer affects today's week, and vice versa.
- Files: `lib/calendarWeek.ts`, `components/SetupWorkspace.tsx`, `components/WeeklyCalendar.tsx`.
- Why it matters: Calendar previously only ever showed the current week, so a plan spanning several weeks had no way to be reviewed ahead of time.
- Deterministic; no AI involvement.

## Study progress

**Status:** Implemented.

- Extended `StudyBlock` with an optional `completedAt` ISO timestamp; `undefined` means incomplete, so existing study blocks keep loading without any storage migration.
- Added `lib/studyProgress.ts`: pure helpers for block duration, completed/incomplete filtering, and completed minutes (overall and per task).
- `PlanWorkspace` now shows a "Mark complete" / "Completed" toggle on every generated session, a Progress summary (focused work, completed, remaining) clamped against legacy data, and correctly re-reads each session's live completion state from the `studyBlocks` store rather than the frozen result computed at generation time.
- `WeeklyCalendar` renders completed study blocks in a visually quieter style with a "Completed" detail, distinct from both an active study block and a normal commitment.
- `completedAt` is intentionally excluded from plan fingerprints (verified by test): marking work complete is progress, not a scheduling input, so it cannot stale a saved plan.
- Files: `types.ts`, `lib/studyProgress.ts`, `components/PlanWorkspace.tsx`, `components/WeeklyCalendar.tsx`.
- Why it matters: without a way to record what's actually done, a regenerated plan has no way to distinguish finished work from work that never happened.
- Deterministic; no AI involvement. Regeneration was not yet progress-aware at this point – that follows in adaptive replanning below.

## Adaptive replanning

**Status:** Implemented.

- Added `lib/studyProgress.ts#calculateRemainingWorkload`: subtracts completed minutes from the deterministic workload per task (not globally), so a task finished ahead of schedule never offsets an unrelated task that still needs its full recommended time. Excess completed time clamps to zero rather than going negative; completed time for a task no longer present in the workload (an edited rubric) is simply ignored, not clawed back from another task.
- Added `lib/studyProgress.ts#replaceIncompleteBlocksForAssignment`: replaces only an assignment's incomplete study blocks, preserving its completed blocks and every other assignment's blocks untouched.
- `PlanWorkspace`'s single `generatePlan` action became `generateOrReplan`: it always schedules the *remaining* workload rather than the full one, which naturally covers first generation, a plain regenerate (nothing completed yet) and a true replan (some sessions done, only the rest gets rescheduled) with one code path instead of three.
- `lib/scheduler.ts#generateStudySchedule` now treats a same-assignment block as occupied time when it is completed (previously all same-assignment blocks were exempt, since the old model discarded and replaced every block on every generation). Discovered via interactive browser testing: without this, replanning could regenerate a new session at the exact same date/time/task as an already-completed one, producing a duplicate `StudyBlock` id that silently hid the completed session's status in the list. Reproducing this needs only a session dated ahead of "now" and marked complete early - not a contrived edge case.
- `lib/planSnapshot.ts#getReservableStudyBlocks` now excludes completed blocks: a finished session no longer reserves time away from a different assignment's plan.
- Stale-plan display now distinguishes completed history from obsolete incomplete work: while stale, only completed sessions remain visible (still counted, per the fingerprint-independence rule from the study-progress phase); incomplete stored sessions are hidden until the user explicitly replans.
- Added an explicit "All done" state (`PlanWorkspace`) for when the remaining workload reaches zero, rather than presenting a zero-required "on track" schedule as if it were an active one.
- Files: `lib/studyProgress.ts`, `lib/scheduler.ts`, `lib/planSnapshot.ts`, `components/PlanWorkspace.tsx`.
- Why it matters: without this, "replanning" would silently discard finished work and re-schedule the full original workload every time, and could collide a new session with an already-completed one at the same slot.
- Deterministic; no AI involvement.

## Plan-change explanations

**Status:** Implemented.

- Added `lib/planSnapshot.ts#getPlanChangeReasons`: compares the stored plan fingerprint against current inputs category by category (assignment, module workload, timetable, recurring commitments, dated commitments) rather than as an opaque string diff. Reuses the same snapshot shape `createPlanFingerprint` already produces, so comparisons stay order-insensitive wherever the snapshot already is. A malformed or unrecognised stored fingerprint falls back to the broadest reason instead of crashing.
- Added `lib/replanSummary.ts#summarizeReplan`: a pure, deterministic comparison of an assignment's incomplete StudyBlocks before and after a replan, matched by a semantic key (`taskId + date + start + end`) rather than block id, since ids can change with placement. Completed blocks are excluded from both sides - they're history, not something that was replanned. Rescheduled time is reported conservatively as the smaller of removed-work and added-work minutes, never claiming a specific old session "moved to" a specific new one.
- The stale-plan banner now names what actually changed (e.g. "Reason: Recurring commitments changed") instead of a generic "your inputs changed."
- After a regenerate or replan, a "Plan updated" summary shows how many sessions were replaced, how much remaining time was rescheduled, the same change reasons, and the resulting schedule status - or, when the fingerprint changed but no session placement did, says so explicitly rather than inventing movement. Shown only for a regenerate/replan; a first-time "Generate plan" has no prior plan to compare against, so no summary is shown. Component state only, reset on assignment switch; nothing new persisted to localStorage.
- Files: `lib/planSnapshot.ts`, `lib/replanSummary.ts`, `components/PlanWorkspace.tsx`.
- Why it matters: a plan that silently changes underneath the student, with no explanation, is not trustworthy even if it's correct.
- Deterministic; no AI involvement, per the explicit no-AI-for-explanations rule.

## Planning preferences / Settings

**Status:** Implemented.

- Added a `PlanningPreferences` type (`types/index.ts`) covering study window, preferred session length, daily study target, preferred time of day and enabled study days, plus `lib/planningPreferences.ts` (`DEFAULT_PLANNING_PREFERENCES`, `normalizePlanningPreferences`, `arePlanningPreferencesDefault`) so malformed, partial or legacy stored preferences always resolve to a valid object rather than throwing.
- Added a fourth `/settings` route and `SettingsWorkspace` (localStorage-backed, auto-saving after hydration) with sections for study window, study days, preferred session length, daily target, preferred time of day, and a "Restore scheduling defaults" action that resets only preferences - Calendar data, assignments, and progress are untouched. `AppShell` navigation now has four items with a two-column mobile grid.
- Default preferences (`studyStart: "08:00"`, `studyEnd: "22:00"`, `preferredSessionMinutes: 90`, `dailyStudyTargetMinutes: 180`, `preferredTimeOfDay: "none"`, all seven days enabled) reproduce the exact pre-Settings scheduler behaviour; the default-parity regression test asserts `generateStudySchedule` produces identical output whether `preferences` is omitted or the explicit defaults are passed.
- `lib/scheduler.ts#generateStudySchedule` now normalizes preferences at its own boundary and uses them for: the effective study window (replacing the previous hard-coded `08:00–22:00` clip), which study days have any capacity at all (a disabled day is zero capacity, and its recurring commitments are never inspected), the preferred session length (a target within the existing 60–120 minute bounds, not a new bound), and the daily study target (a soft first-pass portion size - the existing two-pass strategy still lets a second pass exceed it so a schedulable assignment still fits).
- Added deterministic time-of-day prioritisation: free ranges are split at fixed 12:00/17:00 band boundaries and reordered by preference (`morning`→afternoon→evening, and so on) only when a preference is active; splitting only changes shape, never total minutes, so total capacity is identical across `none`/`morning`/`afternoon`/`evening`, and a preferred band that is unavailable falls back to the next band in priority order rather than reducing capacity.
- `lib/planSnapshot.ts` extends `PlanInputs` with optional `planningPreferences`; the serialized snapshot omits them entirely when they equal the defaults, so a plan fingerprinted before Settings existed is unchanged by Settings existing - only a real preference change alters the fingerprint. Enabled-day ordering is normalized before comparison, so reordering the same days is never a false change. `getReservableStudyBlocks` now factors current preferences into other-assignment freshness, so a preference change also makes other assignments' saved plans stale/non-reservable consistently with every other staling rule.
- Extended `getPlanChangeReasons` with a `planning-preferences` category ("Study preferences changed"), shown by the existing stale banner and "Plan updated" summary UI with no new UI surface required.
- `PlanWorkspace` reads and normalizes stored preferences once at hydration and passes the same object to every scheduler call (the recalculated/current result and `generateOrReplan`) and every `createPlanFingerprint` call, so no code path can silently fall back to different behaviour than another.
- Files: `types/index.ts`, `lib/planningPreferences.ts`, `lib/scheduler.ts`, `lib/planSnapshot.ts`, `lib/storage.ts`, `components/AppShell.tsx`, `components/SettingsWorkspace.tsx`, `app/settings/page.tsx`, `components/PlanWorkspace.tsx`.
- Why it matters: without user-adjustable scheduling preferences, every student got the same fixed study window, session length and pacing regardless of how they actually like to work - and any change still needed to flow through the same explicit stale/replan/explanation machinery already built, not a silent side channel.
- Deterministic; no AI involvement. Tests: `tests/planningPreferences.test.ts` (helper normalization/defaults) plus scheduler, fingerprint and reservation-freshness cases added to `tests/planning.test.ts`.

## Documentation and deployment

**Status:** Implemented.

- Corrected stale documentation referencing an earlier evaluated model (`Qwen3.5-397B-A17B`); production configuration uses `Qwen/Qwen3-VL-30B-A3B-Instruct` (`worker/wrangler.jsonc`).
- Rewrote `README.md` to the standard project-name/demo/problem/features/architecture/tests/licence structure, added a text architecture diagram, and pointed the live demo link at the current deployment.
- Expanded `PROJECT_BRIEF.md` with sections covering progress tracking, replanning, explainability and the multi-week Calendar, alongside the existing workload model and scheduler documentation.
- Deployment: the frontend is a Next.js app deployed on Vercel from this repository; the AI backend is a shared Cloudflare Worker (Featherless-backed) that now also allow-lists this deployment's origin alongside the original project's origin, so both can call the same Worker without either origin being removed. Only Worker config/code changes require redeploying the Worker; ordinary frontend changes only need a Vercel deploy.
- Files: `README.md`, `PROJECT_BRIEF.md`, `BASELINE.md`, `CHANGES.md`, `worker/src/index.ts` (origin allow-list, done earlier), `next.config.ts` (GitHub Pages basePath, done earlier).
- Deterministic; no AI involvement (documentation and configuration only).
