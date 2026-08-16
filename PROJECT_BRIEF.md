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

PlanAround has three main areas:

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
→ Qwen3.5-397B-A17B
→ validated structured draft
→ user review