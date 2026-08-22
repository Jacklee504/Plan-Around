# Baseline Disclosure

This repository is a continuation of [`Jacklee504/PlanAround`](https://github.com/Jacklee504/PlanAround), which I originally started and submitted for the Impact Forge hackathon, entirely within that hackathon's timeline. Every change in this repository from the baseline commit below onward is new work, built for submission to the Pixel Forge AI Hackathon within its dates.

This project extends that work. It does not rebuild it.

## Baseline commit

- Commit: `259a1adf785bebd7bd77c3964b8c28b739164c81`
- Message: `Show study plan in Sunday-first calendar`
- Tag: `ha1-baseline`

Everything after this commit is new work for the Pixel Forge submission; the full git history from the baseline commit onward is the record of it.

## Capabilities inherited from the original project

- Timetable/calendar onboarding.
- AI timetable interpretation (screenshot/PDF import).
- AI assignment interpretation (screenshot or pasted text).
- Editable, user-reviewed AI extraction – nothing is auto-accepted.
- Deterministic workload calculation from ECTS, assessment weighting and rubric structure.
- Deterministic study scheduling around real availability.
- Generated study blocks rendered in Calendar.
- Stale-plan detection via input fingerprints.
- Multi-assignment reservation logic, so plans do not overlap.

## What's new since the baseline

Everything else described in [README.md](README.md) and [PROJECT_BRIEF.md](PROJECT_BRIEF.md) is new: multi-week Calendar navigation, study-session progress tracking with progress-aware replanning, deterministic plan-change explanations, manual missed-session marking, a replan preview, scheduling preferences in Settings, first-class PDF upload for assignment briefs and timetables, data backup/export, ICS calendar export, session reminders, progress insights, a Monday-first week, PWA/offline install support, multi-semester reset, and a mobile-responsive Calendar. Those two files already document each in full; this file exists only to mark the line between inherited and new work.
