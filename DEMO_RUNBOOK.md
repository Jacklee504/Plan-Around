# Demo Runbook

Reproducibility notes for recording or rehearsing a PlanAround demo. This is not marketing copy.

Some steps in this runbook need live production access (Vercel/Cloudflare dashboards, a real Featherless
call) that this repository's automated tooling does not have permission to run unattended. Those steps are
marked **(run manually before recording)**.

## Canonical demo URLs

- Primary frontend: `https://planaround.vercel.app/`
- GitHub Pages fallback: `https://jacklee504.github.io/Plan-Around/`
- Public repository: `https://github.com/Jacklee504/Plan-Around`
- Worker health endpoint: `https://planaround-ai.0jacklee05.workers.dev/health`

## Pre-demo checks

- [ ] **(run manually)** Vercel production deployment is green.
- [ ] Worker `/health` returns HTTP 200: `curl -i https://planaround-ai.0jacklee05.workers.dev/health`, or run `npm run smoke:production`.
- [ ] **(run manually)** Featherless balance/provider preflight is healthy: `FEATHERLESS_API_KEY="..." npm run preflight:provider`.
- [ ] **(run manually, costs one real request)** One production text-analysis smoke has completed: `SMOKE_RUN_AI=1 npm run smoke:production`.
- [ ] Clean browser/localStorage reset (open the production URL in a private/incognito window, or clear `plan-around.*` keys).
- [ ] Sample files ready: [`demo/sample-assignment.txt`](demo/sample-assignment.txt) and [`public/semester-1-timetable.pdf`](public/semester-1-timetable.pdf). To show PDF upload specifically (text-extraction and vision-fallback paths for both assignments and timetables), the `demo/` folder also has [`demo/software_engineering_project.pdf`](demo/software_engineering_project.pdf) (text-layer assignment PDF), [`demo/02_cloud_distributed_systems_full.png`](demo/02_cloud_distributed_systems_full.png) (scanned/image-only assignment input), and [`demo/demo_timetable_visual_grid.pdf`](demo/demo_timetable_visual_grid.pdf) (visual timetable PDF that falls back to vision).

## Demo sequence (~3 minutes)

A StudyBlock cannot be marked complete before its scheduled local start time — this is an intentional
product rule (`lib/studyProgress.ts#canCompleteStudyBlock`), not a bug. A plan generated moments before
recording will normally have no session eligible to complete yet, so the progress/replan segment (steps
7, 10, 11) needs a plan that was generated earlier, not one generated live in the same take. Prefer, in
order:

1. Generate the plan (steps 1-6) well before recording, so at least one scheduled session has genuinely
   started or passed by the time steps 7-11 are recorded for real.
2. Record steps 7-11 from a separate pre-prepared browser profile/state created earlier through the
   normal UI, and cut to it in the edit.
3. If the demo must be one completely fresh take, omit the completion-preservation segment (steps 7, 10,
   11) rather than working around the completion rule.

Do not edit localStorage, change the system clock, or add a demo-only bypass to force early completion.

1. Show Calendar / a normal week.
2. Import the sample timetable PDF (`public/semester-1-timetable.pdf`) if time permits.
3. Add the sample assignment brief (`demo/sample-assignment.txt`) via paste-text and run AI analysis.
4. Review the extracted structure (title, deadline, weighting, tasks, marks).
5. Save it and generate the deterministic plan.
6. Navigate to a future week in Calendar.
7. Mark a session complete once it is actually eligible (its scheduled start has passed — see the note above).
8. Add a commitment that conflicts with an incomplete study block.
9. Return to Plan and show the stale-plan reason.
10. Replan remaining work.
11. Show the completed session preserved and the remaining sessions moved.
12. Briefly show Settings/preferences affecting where new sessions land.

Do not try to show every control — this sequence is the differentiator path (AI extraction, deterministic
scheduling, adaptive replanning, planning preferences), not a full feature tour.

## Known expected state

Using `demo/sample-assignment.txt` (Database Systems Coursework 2), extraction should land on roughly:

- Title referencing the database design/coursework report.
- Deadline `2026-11-14`.
- Weighting `40%`.
- Five rubric tasks, summing to 100 marks (20/30/25/15/10).

The exact wording of task names/rationales is AI-generated and can vary between runs. Treat this as
correct as long as the structured fields (deadline, weight, marks, task count) are reviewable and roughly
match the brief — do not expect verbatim repeatability.

## Fallback path

If live AI is temporarily unavailable while recording:

1. Confirm Worker/provider state first (`npm run smoke:production`, then `preflight:provider` if that fails).
2. Retry once.
3. If the Vercel frontend itself is the problem, switch to the GitHub Pages mirror.
4. Do not fake an AI result in the recorded/submitted build — if it cannot be shown live, say so rather than
   scripting a fabricated response.
