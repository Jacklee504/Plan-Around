# PlanAround

**Fit assignments around your actual week.**

PlanAround helps students turn an assignment brief and their real weekly schedule into a realistic study plan.

It uses AI to interpret timetable screenshots and assignment briefs, while workload estimation and scheduling remain deterministic and explainable.

**Live demo:** https://plan-around.vercel.app/

## What it does

- Import a timetable screenshot and review the detected classes.
- Add recurring and one-off commitments.
- Analyse or manually enter an assignment.
- Estimate workload from ECTS, assignment weighting and rubric structure.
- Schedule study sessions around the student's actual availability.

## Why PlanAround?

Calendars can show when a student is free, but they do not answer **how much work an assignment deserves** or **how that work should be distributed before the deadline**.

PlanAround combines both problems into one planning workflow.

## Built with

Next.js · TypeScript · Tailwind CSS · Cloudflare Workers · Featherless

AI handles interpretation. Workload calculation and scheduling are deterministic.

## Run locally

```bash
npm install
npm run dev
```

## More detail

See [PROJECT_BRIEF.md](PROJECT_BRIEF.md) for the workload model, scheduling rules, architecture and prototype scope.
