# PlanAround - Project Brief

## Purpose

PlanAround is a desktop-focused student planning web app that turns assignment requirements and a student's actual availability into an explainable study plan.

It combines timetable information, recurring commitments, one-off events, module workload and assignment structure to answer two questions:

1. How much work does this assignment reasonably deserve?
2. Where can that work realistically fit before the deadline?

The goal of the hackathon prototype is to demonstrate this complete workflow reliably rather than build a general productivity platform.

## Problem

Students usually know when an assignment is due, but not:

- how much time they should spend on it;
- which parts of the assignment deserve the most attention;
- where that work fits around lectures, work, exercise and other commitments;
- whether enough time actually remains before the deadline.

Calendars show availability. Task lists show what needs to be done. PlanAround combines both into one planning workflow.

## Product Flow

PlanAround has four main areas:

### Calendar

First-run onboarding establishes the student's normal recurring week.

The student can:

- import a timetable screenshot using AI-assisted extraction;
- review and correct detected teaching sessions;
- confirm module ECTS values;
- add recurring commitments directly through the calendar;
- complete setup once the normal week is ready.

After onboarding, Calendar becomes the main availability interface.

The student can:

- add recurring or date-specific events;
- edit or delete commitments;
- mark a class as not attended this week;
- mark a class as normally not attended;
- replace the recurring timetable.

### Assignments

The student can create an assignment manually or analyse a pasted brief or screenshot.

AI can extract a reviewable draft containing:

- title;
- deadline;
- module weighting;
- rubric tasks;
- marks;
- requirements;
- relative complexity.

Nothing extracted by AI is automatically accepted.

### Plan

PlanAround calculates a workload recommendation and fits that work into the student's remaining availability before the deadline.

The generated plan includes:

- total recommended workload;
- focused work;
- project buffer;
- task-level workload split;
- scheduled study blocks;
- schedule status.

### Settings

The student can adjust how the scheduler places sessions without changing what work is required:

- study window (earliest start, latest finish);
- preferred session length (60, 90 or 120 minutes);
- daily study target (2-5 hours, a soft first-pass portion size);
- preferred time of day (morning, afternoon, evening or no preference);
- which days study sessions can be placed on.

Defaults reproduce the pre-Settings scheduler behaviour exactly. Preferences change where the scheduler places sessions - they never change the underlying ECTS-based workload, assignment weighting, buffer, task-mark weighting or complexity adjustment, and they never alter completed work.

## AI Boundary

AI is used only to interpret unstructured input such as timetable screenshots and assignment briefs.

AI does not:

- calculate workload hours;
- decide study times;
- modify calendar constraints automatically;
- bypass user review.

Workload calculation and scheduling are deterministic TypeScript logic.

Production AI flow:

```text
Browser
→ Cloudflare Worker
→ Featherless
→ Qwen/Qwen3-VL-30B-A3B-Instruct
→ validated structured draft
→ user review
```

A larger model (Qwen3.5-397B-A17B) was evaluated earlier in development but is not used in the production workflow; the Worker's `AI_PRIMARY_MODEL` is `Qwen/Qwen3-VL-30B-A3B-Instruct`. A verifier/second-model path exists in the Worker response shape but is not active in the live product (`verifier.used` is always `false`).

## Planning Approach

PlanAround estimates assignment workload using module ECTS, assessment weighting and rubric structure rather than asking an AI model to guess a study duration.

The workload is then scheduled deterministically around the student's classes and commitments before the deadline.

The student can review and override the workload recommendation when needed.

## Scheduling

The scheduler uses the student's actual availability and avoids:

- attended teaching sessions;
- recurring commitments;
- one-off dated commitments;
- existing study sessions from other current plans.

It prefers practical study sessions of roughly 60–120 minutes and aims to finish before the deadline where possible.

The result is shown as:

- **On track**
- **Schedule is tight**
- **Not enough available time**

If relevant inputs change, the existing plan is treated as outdated and must be regenerated.

## Progress

A StudyBlock can record completion through an optional `completedAt` timestamp. Study blocks generated before this feature have no `completedAt`, so they load as incomplete without any storage migration.

Completed minutes are tracked per task, and progress is shown against the assignment's recommended workload rather than a raw block count.

## Replanning

- Completed work remains historical: it is never removed or regenerated, and it is excluded from what counts as "stale."
- Incomplete stale blocks are replaceable: once a plan's inputs change, its remaining incomplete sessions can be discarded and rebuilt.
- Remaining workload is calculated per rubric task, not as a single global subtraction, so finishing one task early does not reduce time recommended for a different task.
- Other valid incomplete assignment blocks reserve time, so replanning one assignment does not overwrite another assignment's plan; a completed block frees the time it occupied instead of reserving it forever.
- Replanning is explicit: it happens when the student generates or regenerates a plan, never silently in the background.

## Explainability

- Stale reasons come from a deterministic comparison of the current plan inputs against the inputs snapshot stored when the plan was made (assignment, module workload, timetable, recurring commitments, dated commitments, planning preferences).
- Replan summaries compare the old and new scheduled study blocks to report how many sessions were replaced and how much remaining time moved.
- AI is not used to explain or choose schedule changes; both the stale reasons and the replan summary are plain deterministic TypeScript.

## Multi-week Calendar

Calendar displays a Sunday-first week and can navigate to any week, not only the current one.

Attendance state ("not going this week") uses a separate Monday-based week key, independent of which week is currently being viewed, so marking a class skipped while browsing a future week does not affect the real current week.

## Technology

PlanAround uses:

- Next.js
- React
- TypeScript
- Tailwind CSS
- localStorage
- Vercel
- Cloudflare Workers
- Featherless
- Qwen/Qwen3-VL-30B-A3B-Instruct

Workload calculation and scheduling are implemented as deterministic TypeScript logic outside the AI layer.

## Scope

The hackathon prototype focuses on the complete flow from timetable and assignment input to a realistic study plan.

It is designed primarily for desktop use.

Outside the current scope:

- calendar-provider integrations;
- accounts and cloud persistence;
- generic PDF OCR;
- automatic replanning;
- native mobile applications;
- general-purpose task management.

## Core Principle

Use AI to understand messy input.

Use deterministic logic for decisions that should be explainable.