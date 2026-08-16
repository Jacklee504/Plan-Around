# PlanAround — Project Brief

## Purpose

PlanAround is a mobile-first student planning web app that turns assignment details and a rubric into a realistic study plan. It estimates recommended effort from the module's ECTS value, assessment weighting, rubric marks, and requirement complexity, then schedules that work around a student's recurring commitments before the deadline.

## The problem

Students can see a deadline but often cannot tell how much work an assessment warrants or how to fit it around classes, work, meals, exercise, and other fixed commitments. Generic task lists and calendars leave the planning work to the student.

## Product promise

> Assignment details + weekly schedule → an evidence-based workload breakdown and a ready-to-follow study plan.

The app is not a general productivity tool, calendar replacement, AI tutor, or task manager. Its value is in producing one clear, explainable assignment plan.

## First hackathon prototype

Demonstrate one complete path with three routes:

```text
/setup → /assignment → /plan
```

1. **Setup:** establish a recurring seven-day baseline by reviewing timetable screenshot extraction or the supplied local PDF fallback, confirm ECTS, and add weekly blocked periods.
2. **Assignment:** select a module, enter title, deadline and grade weighting, then add rubric tasks manually or load the supplied demo assignment.
3. **Plan:** review the workload breakdown and generated study blocks grouped by day.

Assignment and timetable analysis are AI-assisted, never automatically accepted, and always remain editable. This keeps the workload and scheduling decisions fully explainable.

## Workload model

Keep the calculation transparent and clearly label it as a recommended prototype heuristic, not an official university workload calculation.

```text
module hours = ECTS × HOURS_PER_ECTS                     (default 22.5)
assessment pool = module hours × ASSESSMENT_WORKLOAD_FACTOR (default 0.4)
assignment workload = assessment pool × assignment grade weight
buffer = assignment workload × 10%
usable task workload = assignment workload − buffer
task share = (task marks × complexity adjustment) / total adjusted task weights
```

Round task durations to sensible 30-minute increments. A user can override the recommended total, with task durations redistributed proportionally.

The supplied demo assignment uses a credible software-project breakdown: implementation, testing and evaluation, technical report, and presentation. Each manual task has marks, requirements and a relative complexity factor.

## Scheduling rules

- Consider availability from 08:00 to 22:00.
- Treat a date-only deadline as the end of that date. Aim to finish before the deadline date, then use it only when earlier capacity is insufficient and surface a warning.
- Remove recurring commitments for each matching weekday and one-off commitments only on their exact dates.
- Ignore free gaps under 60 minutes and use 60–120 minute study sessions.
- Aim for roughly three assignment hours a day, increasing only when the deadline makes it necessary.
- Allocate tasks in the analysis order and split tasks across sessions when needed.
- Compare required workload with available capacity and display: **On track**, **Schedule is tight**, or **Not enough available time**.

## Technical boundaries

- Next.js, TypeScript, Tailwind CSS, App Router
- localStorage only; no auth or database
- PWA-friendly, Vercel-compatible, mobile-first responsive UI
- Pure calculation/scheduling code outside React components

Suggested separation:

```text
app/          routes and page composition
components/   forms and presentation
lib/          storage, workload, scheduler, assignment analyzer
types/        shared domain types
```

## Demo definition of done

A judge can add a 10 ECTS module and recurring commitments, enter a 40% assignment with a deadline and rubric tasks, inspect an explainable rubric-weighted workload recommendation, and receive a timetable that fits around those commitments.

## Deliberately excluded

Calendar integrations, drag-and-drop scheduling, automatic replanning, completion tracking, personal productivity modelling, generic student tools, accounts, databases, payments, native apps, generic PDF OCR and multi-page timetable ingestion.
