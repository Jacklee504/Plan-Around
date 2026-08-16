# PlanAround

Fit assignments around your actual week.

[Open the live prototype](https://jacklee504.github.io/PlanAround/)

Rather than offering another generic to-do list, it makes the planning decision for a single assessment visible and explainable:

```text
Assignment details + module weighting + weekly commitments
→ workload breakdown + automatically scheduled study sessions
```

## What the prototype demonstrates

- Download and upload a readable Semester 1 timetable PDF.
- Parse its timetable rows locally into modules, lectures, labs, and tutorials.
- View the resulting teaching schedule in an editable weekly calendar.
- Mark a class as not attended for the current week or for every week.
- Add personal commitments alongside classes.
- Add an assignment against an imported module, with its deadline and module weighting.
- Paste an assignment brief into an AI-assisted review, then inspect and apply only the suggested title, deadline, weighting and rubric tasks you want. Missing marks remain for the student to confirm.
- Optionally add rubric tasks, marks, complexity and notes manually, or load realistic demo details.
- Review a transparent, rubric-weighted workload recommendation and override its total when needed.
- Generate study blocks from 08:00 to 22:00 around attended classes and personal commitments.
- Aim to finish before the deadline date, using that date only when capacity makes it necessary, and flag plans as On track, Tight or Not enough time.
- Detect when timetable, commitment or workload inputs have changed, and require the plan to be regenerated before showing saved study blocks.
- Keep constraints, assignments and generated study blocks in local browser storage.

## Why the workload is different

PlanAround does not present an unexplained AI time guess. The recommended workload begins with module ECTS, assessment weighting, and configurable prototype assumptions, then distributes time across rubric tasks using marks and relative complexity. The user can inspect and adjust the result.

## Prototype scope

The app is a mobile-first Next.js/TypeScript web app with three steps:

```text
1. Timetable   Import and adjust classes plus personal commitments
2. Assignment  Assessment details and optional rubric tasks
3. Plan        Workload review and generated study timetable
```

Persistence is local to the browser.

## Demo in three steps

1. In **Timetable**, download and import the supplied Semester 1 timetable PDF, then confirm the detected module credits and add a commitment if useful.
2. In **Assignment**, load the sample brief, analyse it, review the suggested rubric, and confirm any missing marks before saving. Manual rubric entry remains available throughout.
3. In **Plan**, generate the proposed study sessions and show the workload story, project buffer, status and sessions grouped by date.

## How it works

```text
Timetable → local parser → constraints

Assignment brief
→ Cloudflare Worker
→ Featherless + Qwen3.5-397B-A17B
→ reviewed, editable rubric

Assignment + rubric
→ deterministic workload.ts

Constraints + workload
→ deterministic scheduler.ts
→ study plan
```

### Timetable import note

The first release supports the supplied timetable PDF format and extracts its readable schedule rows locally. It is a controlled prototype import, not general support for every university PDF or screenshot.

## Stack

- Next.js + App Router
- TypeScript
- Tailwind CSS
- localStorage
- GitHub Pages frontend hosting
- Cloudflare Worker AI boundary
- Featherless + Qwen3.5-397B-A17B for text and screenshot interpretation
- Deterministic scheduling and workload logic

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root opens the timetable step.

For the demo, download `Semester 1 timetable` from the app, then select the downloaded PDF to see the local importer build the calendar.

### AI-assisted brief review

The live prototype sends an assignment brief or screenshot to a Cloudflare Worker, which uses Featherless with `Qwen/Qwen3.5-397B-A17B` to produce a structured draft rubric. The student reviews and edits that draft before it affects the assignment. The AI never calculates workload hours, creates study sessions, or bypasses the review step.

For local development, Ollama remains an optional provider. With Ollama running and the `qwen3.5:9b` model installed, use a second terminal:

```bash
npm run ai:local
```

Then use **Analyse with local AI** on the Assignment page. The browser sends the brief only to `http://localhost:8787/analyze`; the local service talks to Ollama. No API key or assignment content is sent to a hosted service in this mode. If either AI provider is unavailable, manual rubric entry remains available.

## Current status

Timetable import, AI-assisted or manual rubric entry, workload estimation, stale-plan detection and deterministic study-session scheduling are complete. AI only extracts a reviewed draft rubric; workload and scheduling remain deterministic.

## Further reference

See [PROJECT_BRIEF.md](PROJECT_BRIEF.md) for the product intent, workload formula, scheduling rules, demo flow, and explicit scope boundaries.
