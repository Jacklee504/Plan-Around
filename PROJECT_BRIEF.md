# Impact Forge — Project Brief

## Purpose

Impact Forge is a mobile-first student planning web app that turns an assignment brief into a realistic study plan. It estimates recommended effort from the module's ECTS value, assessment weighting, rubric marks, and requirement complexity, then schedules that work around a student's recurring commitments before the deadline.

## The problem

Students can see a deadline but often cannot tell how much work an assessment warrants or how to fit it around classes, work, meals, exercise, and other fixed commitments. Generic task lists and calendars leave the planning work to the student.

## Product promise

> Assignment brief + weekly schedule → an evidence-based workload breakdown and a ready-to-follow study plan.

The app is not a general productivity tool, calendar replacement, AI tutor, or task manager. Its value is in producing one clear, explainable assignment plan.

## First hackathon prototype

Demonstrate one complete path with three routes:

```text
/setup → /assignment → /plan
```

1. **Setup:** add modules and weekly blocked periods.
2. **Assignment:** select a module, enter title, deadline and grade weighting, then paste or upload a brief.
3. **Plan:** review the workload breakdown and generated study blocks grouped by day.

Use a mock assignment-analysis service. The UI may accept pasted text and a selected file/image, but no real OCR, PDF processing, or AI API integration is required for this submission.

## Workload model

Keep the calculation transparent and clearly label it as a recommended prototype heuristic, not an official university workload calculation.

```text
module hours = ECTS × HOURS_PER_ECTS                     (default 22.5)
assessment pool = module hours × ASSESSMENT_WORKLOAD_FACTOR (default 0.4)
assignment workload = assessment pool × assignment grade weight
buffer = assignment workload × 10%
usable task workload = assignment workload − buffer
task share = (task marks × complexity) / total adjusted task weights
```

Round task durations to sensible 30-minute increments. A user can override the recommended total, with task durations redistributed proportionally.

The mock analysis should return a credible software-project breakdown, for example: implementation, testing and evaluation, technical report, and presentation. Each task has marks, requirements, and a relative complexity factor.

## Scheduling rules

- Consider availability from 08:00 to 22:00.
- Generate dates from today through 24 hours before the deadline; use this buffer only if capacity is insufficient and surface a warning.
- Remove recurring commitments for each matching weekday.
- Ignore free gaps under 60 minutes and use 60–120 minute study sessions.
- Aim for roughly three assignment hours a day, increasing only when the deadline makes it necessary.
- Allocate tasks in the analysis order and split tasks across sessions when needed.
- Compare required workload with available capacity and display: **On track**, **Schedule is tight**, or **Not enough available time**.

## Technical boundaries

- Next.js, TypeScript, Tailwind CSS, App Router
- localStorage only; no auth or database
- PWA-friendly, Vercel-compatible, mobile-first responsive UI
- Pure calculation/scheduling code outside React components
- Mock analyzer behind a replaceable `analyzeAssignment(...)` interface

Suggested separation:

```text
app/          routes and page composition
components/   forms and presentation
lib/          storage, workload, scheduler, assignment analyzer
types/        shared domain types
```

## Demo definition of done

A judge can add a 10 ECTS module and recurring commitments, enter a 40% assignment with a deadline, trigger the mock analysis, inspect an explainable rubric-weighted workload recommendation, and receive a timetable that fits around those commitments.

## Deliberately excluded

Real document AI/OCR/PDF extraction, calendar integrations, drag-and-drop scheduling, replanning, completion tracking, personal productivity modelling, generic student tools, accounts, databases, payments, and native apps.
