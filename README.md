# PlanAround

Fit assignments around your actual week.

Rather than offering another generic to-do list, it makes the planning decision for a single assessment visible and explainable:

```text
Assignment brief + module weighting + weekly commitments
→ workload breakdown + automatically scheduled study sessions
```

## What the prototype demonstrates

- Download and upload a readable Semester 1 timetable PDF.
- Parse its timetable rows locally into modules, lectures, labs, and tutorials.
- View the resulting teaching schedule in an editable weekly calendar.
- Mark a class as not attended for the current week or for every week.
- Add personal commitments alongside classes.
- Keep the resulting constraints in local browser storage for the assignment-planning steps.

## Why the workload is different

PlanAround does not present an unexplained AI time guess. The recommended workload begins with module ECTS, assessment weighting, and configurable prototype assumptions, then distributes time across rubric tasks using marks and relative complexity. The user can inspect and adjust the result.

## Prototype scope

The app is a mobile-first Next.js/TypeScript web app with three steps:

```text
1. Timetable   Import and adjust classes plus personal commitments
2. Assignment  Assessment details and brief analysis
3. Plan        Workload review and generated study timetable
```

Persistence is local to the browser. The first timetable importer intentionally supports text-based PDFs whose rows contain a weekday, start and end time, module code/name, and session type. It uses the file's content, not its filename or preset data. Broader PDF and screenshot recognition will need an OCR or vision service.

## Stack

- Next.js + App Router
- TypeScript
- Tailwind CSS
- localStorage
- Deterministic scheduling and workload logic

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root opens the timetable step.

For the demo, download `Semester 1 timetable` from the app, then select the downloaded PDF to see the local importer build the calendar.

## Current status

The working timetable-import milestone is complete. The next milestone is assignment entry and task-breakdown review, followed by workload scheduling.

## Further reference

See [PROJECT_BRIEF.md](PROJECT_BRIEF.md) for the product intent, workload formula, scheduling rules, demo flow, and explicit scope boundaries.
