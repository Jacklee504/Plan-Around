# PlanAround

**Fit assignments around your actual week.**

## Live demo

https://planaround.vercel.app/ (also mirrored at https://jacklee504.github.io/Plan-Around/)

## Problem

Students usually know when an assignment is due, but not how much time it deserves, which parts matter most, or where that work actually fits around lectures, work and other commitments. Calendars show availability; task lists show what needs doing. Neither answers both questions together.

## What PlanAround does

- Import a timetable screenshot and review the detected classes.
- Add recurring and one-off commitments.
- Analyse or manually enter an assignment.
- Estimate workload from ECTS, assignment weighting and rubric structure.
- Schedule study sessions around the student's actual availability.

## Adaptive planning flow

The plan is no longer a one-shot output:

- the Calendar can navigate to any week, not only the current one;
- study sessions can be marked completed;
- changed availability (timetable, commitments, module or assignment edits) stales an existing plan;
- completed work is preserved across a replan and is never regenerated or lost;
- remaining, not total, work is what gets replanned;
- the app explains why a plan changed and what was rescheduled, without using AI to make that decision.

See [PROJECT_BRIEF.md](PROJECT_BRIEF.md) for the full detail on each of these.

## AI vs deterministic boundary

AI is used only to interpret unstructured input: timetable screenshots and assignment briefs. It never calculates workload, decides study times, or changes calendar data automatically, and nothing it extracts is auto-accepted.

Workload calculation, scheduling, stale-plan detection, replanning and plan-change explanations are all deterministic TypeScript.

## Architecture

```text
Timetable screenshot / assignment screenshot or text
                    ↓
              Browser UI
                    ↓
           Cloudflare Worker
                    ↓
              Featherless
                    ↓
 Qwen/Qwen3-VL-30B-A3B-Instruct
                    ↓
        validated structured draft
                    ↓
              user review
                    ↓
       deterministic TypeScript
      workload + schedule + replan
                    ↓
       localStorage + Calendar UI
```

## Built with

Next.js · React · TypeScript · Tailwind CSS · Cloudflare Workers · Featherless · Vercel

## Run locally

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
npm run lint
npm run build
```

## Baseline disclosure

This repository is a continuation of a project originally built for a separate hackathon, entirely within that hackathon's timeline. See [BASELINE.md](BASELINE.md) for exactly what was inherited, and [CHANGES.md](CHANGES.md) for every change made since.

Full product detail (workload model, scheduling rules, architecture, prototype scope) is in [PROJECT_BRIEF.md](PROJECT_BRIEF.md).

## Licence

[MIT](LICENSE)
