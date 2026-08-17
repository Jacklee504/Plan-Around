# HA1 Baseline Disclosure

This repository was created by cloning [`Jacklee504/PlanAround`](https://github.com/Jacklee504/PlanAround), which was already a complete, working project (the HA1 submission).

HA2 extends that project. It does not rebuild it.

## Baseline commit

- Commit: `259a1adf785bebd7bd77c3964b8c28b739164c81`
- Message: `Show study plan in Sunday-first calendar`
- Tag: `ha1-baseline`

Everything after this commit is new HA2 work, recorded in [`HA2_CHANGES.md`](HA2_CHANGES.md).

## HA1 capabilities inherited

- Timetable/calendar onboarding.
- AI timetable interpretation (screenshot/PDF import).
- AI assignment interpretation (screenshot or pasted text).
- Editable, user-reviewed AI extraction — nothing is auto-accepted.
- Deterministic workload calculation from ECTS, assessment weighting and rubric structure.
- Deterministic study scheduling around real availability.
- Generated study blocks rendered in Calendar.
- Stale-plan detection via input fingerprints.
- Multi-assignment reservation logic, so plans do not overlap.
