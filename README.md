# PlanAround

Fit assignments around your actual week.

Rather than offering another generic to-do list, it makes the planning decision for a single assessment visible and explainable:

```text
Assignment brief + module weighting + weekly commitments
→ workload breakdown + automatically scheduled study sessions
```

## What the prototype demonstrates

- Add modules with ECTS credits and recurring weekly commitments.
- Enter an assignment title, deadline, and percentage of the module grade.
- Analyse a brief through a mocked, replaceable analysis service.
- Allocate recommended workload using rubric marks and task complexity.
- Automatically place 60–120 minute study sessions into free time before the deadline.
- Show whether the assignment is on track, tight, or exceeds available study time.

## Why the workload is different

PlanAround does not present an unexplained AI time guess. The recommended workload begins with module ECTS, assessment weighting, and configurable prototype assumptions, then distributes time across rubric tasks using marks and relative complexity. The user can inspect and adjust the result.

## Prototype scope

The app is a mobile-first Next.js/TypeScript web app with three screens:

```text
1. Setup       Modules and recurring commitments
2. Assignment  Assessment details and brief analysis
3. Plan        Workload review and generated study timetable
```

Persistence is local to the browser. Assignment analysis is mocked for the prototype so the core planning flow can be demonstrated end to end without accounts, a database, or document-processing infrastructure.

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

Open [http://localhost:3000](http://localhost:3000). The root route redirects to `/setup`.

## Current status

The responsive app shell, shared three-step navigation, and placeholder screens are implemented. The next build phase adds the setup forms and local browser persistence.

## Further reference

See [PROJECT_BRIEF.md](PROJECT_BRIEF.md) for the product intent, workload formula, scheduling rules, demo flow, and explicit scope boundaries.
