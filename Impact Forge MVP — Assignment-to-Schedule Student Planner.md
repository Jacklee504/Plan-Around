# Project overview

Build a **mobile-first responsive web app/PWA** for students that converts an assignment brief into a realistic study plan based on:

1. The module's ECTS credits.
2. The percentage of the module grade represented by the assignment.
3. The assignment's actual marking rubric and requirements.
4. The student's recurring real-life commitments.
5. The assignment deadline.

The central idea is:

> **Upload an assignment brief, understand how much effort each part deserves, and automatically fit that work around the student's actual life.**

This is **not** intended to be a generic productivity app, calendar replacement, AI tutor, task manager, or study assistant.

The MVP should prove one complete workflow with only three core pages.

---

# Core product principles

There are two equally important features.

## 1. Evidence-based workload weighting

The app must not simply ask an LLM:

> "How long do you think this will take?"

The workload calculation should instead be grounded in:

- module ECTS credits;
- expected workload per ECTS;
- assignment percentage of the module;
- marks available for each rubric section;
- explicit requirements in the assignment;
- relative complexity of those requirements.

The user should be able to see **why** time has been allocated to a task.

Example:

> Implementation — 45% of marks  
> Requires frontend, REST API, database and deployment  
> Recommended allocation: 12–14 hours

rather than:

> AI thinks this will take 13 hours.

The estimate does not need to claim perfect accuracy. It should be presented as a **recommended workload allocation**.

---

## 2. Automatic scheduling around real life

Once the workload has been calculated, the app should automatically place study sessions into free periods around:

- classes;
- gym;
- cooking/meals;
- work;
- recurring social commitments;
- other unavailable periods.

The student should not have to manually drag individual assignment tasks into calendar slots.

The intended experience is:

> Assignment brief + existing weekly schedule → completed study plan.

---

# Important MVP scope

The submission deadline is tomorrow, so keep the implementation intentionally small.

Build only the minimum needed to demonstrate this flow:

```text
Semester/module setup
        ↓
Recurring weekly commitments
        ↓
Add assignment
        ↓
Assignment is converted into structured tasks
        ↓
Workload engine allocates hours
        ↓
Scheduler finds free time
        ↓
Generated study plan
```

Do not expand beyond this until the complete flow works.

---

# Recommended stack

Use:

- Next.js
- TypeScript
- Tailwind CSS
- App Router
- localStorage for persistence
- Vercel-compatible structure

Do not add authentication or a database for the MVP.

Organize calculation logic separately from React components so that scheduling/workload functions are easy to test and replace later.

---

# Three-page application

The entire initial app should have only three main pages/routes.

Suggested routes:

```text
/setup
/assignment
/plan
```

The root route can simply redirect to `/setup`.

Use a simple three-step indicator at the top:

```text
1 Setup → 2 Assignment → 3 Plan
```

Design mobile-first but ensure it works comfortably on desktop.

---

# Page 1 — Semester Setup

Purpose:

Store the information that should only need to be entered once at the beginning of a semester.

## Section A — Modules

Allow the user to add modules.

Each module requires:

```ts
{
  id: string;
  code?: string;
  name: string;
  credits: number;
}
```

Example:

```text
CT4101
Distributed Systems
10 ECTS
```

Support multiple modules.

No complex module-management system is necessary.

Basic actions:

- Add module
- Edit module
- Delete module

Persist modules to localStorage.

---

## Section B — Recurring weekly commitments

Allow the student to define periods when assignment work should not normally be scheduled.

Examples:

```text
Monday
09:00–13:00 Classes
17:00–18:30 Gym
19:00–20:00 Dinner
```

Commitment structure:

```ts
type Commitment = {
  id: string;
  label: string;
  dayOfWeek: number;
  start: string;
  end: string;
  category:
    | "class"
    | "gym"
    | "meal"
    | "social"
    | "work"
    | "other";
};
```

A very simple form is sufficient:

- Day
- Start time
- End time
- Label/category

Do not build a drag-and-drop calendar.

Display commitments grouped by weekday.

Persist them to localStorage.

---

## Default scheduling settings

For the prototype, define sensible defaults in code:

```text
Available study day:
08:00–22:00

Preferred minimum study block:
60 minutes

Preferred maximum study session:
120 minutes

Preferred assignment work per day:
approximately 3 hours where possible

Deadline safety buffer:
aim to finish scheduled work at least 24 hours before submission
```

These do not need settings UI yet.

---

# Page 2 — Add Assignment

Purpose:

Convert an assignment into structured data that the planning engine can use.

The user chooses:

### Module

Dropdown populated from Page 1.

### Assignment title

Example:

```text
Distributed Systems Project
```

### Deadline

Date and time.

### Assignment weight

Percentage of the entire module grade.

Example:

```text
40%
```

This is essential because the system should distinguish between:

- a small 5% lab;
- a major 40% project.

---

# Assignment input

The intended final product should support:

- screenshots/photos;
- PDF;
- pasted text.

However, **do not build full vision/PDF/API processing in the first implementation**.

For the first working version:

- provide a file upload control;
- provide a paste-text textarea;
- allow the user to select an image and optionally preview it;
- make the Analyze button call a mock analysis service.

Create the code architecture so that the mock service can later be replaced with a real API call without changing the UI.

Example:

```ts
analyzeAssignment(input): Promise<AssignmentAnalysis>
```

Initially this function can return predefined structured data.

---

# Mock assignment result

Use a realistic sample such as:

```text
Software Engineering Project

Implementation — 45 marks
Testing & Evaluation — 25 marks
Technical Report — 20 marks
Presentation — 10 marks
```

Requirements could include:

```text
Implementation
- frontend
- REST API
- database
- deployment

Testing
- unit tests
- integration tests
- evaluation

Report
- 2,500 words
- references
- architecture discussion

Presentation
- 5-minute demonstration
```

Structured form:

```ts
type AssignmentTask = {
  id: string;
  name: string;
  marks: number;
  requirements: string[];
  complexity: number;
};
```

Use a simple complexity number for now, for example:

```text
0.75 = relatively simple
1.0 = normal
1.25 = moderately complex
1.5 = high complexity
```

The mock data can provide these values.

The future AI analyzer will determine them.

---

# Workload calculation

This is one of the core pieces of original application logic.

Avoid pretending that the calculation is scientifically exact.

It should be transparent and easy to adjust.

## Step 1 — Module workload

Use an adjustable constant:

```ts
HOURS_PER_ECTS = 22.5
```

This represents a prototype midpoint between typical ECTS workload ranges.

Example:

```text
10 ECTS × 22.5 = 225 total module workload hours
```

Keep this as a constant/config value rather than scattering the number throughout the code.

---

## Step 2 — Assessment-specific workload pool

Total ECTS workload includes lectures, general study and other work, so do **not** directly multiply:

```text
225 × assignment percentage
```

and claim that this is the exact assignment workload.

For the prototype, use another clearly named configurable constant:

```ts
ASSESSMENT_WORKLOAD_FACTOR = 0.4
```

Therefore:

```text
10 ECTS module
225 total workload hours

Assessment-specific workload pool:
225 × 0.4 = 90 hours
```

If this assignment is worth 40% of the module:

```text
90 × 0.40 = 36 hours
```

So the app would begin with:

> Recommended assignment workload: approximately 36 hours.

This is a prototype heuristic and must remain easy to change later.

Do not present it as an official university calculation.

---

# Step 3 — Reserve buffer

Reserve approximately 10% of the assignment workload for:

- debugging;
- polishing;
- submission;
- unexpected delays.

Example:

```text
36 hours total

3.6h buffer
32.4h distributed across rubric tasks
```

Round durations to sensible increments such as 30 minutes.

---

# Step 4 — Rubric-weighted task allocation

Marks provide the baseline weighting.

Example:

```text
Implementation: 45 marks
Testing: 25
Report: 20
Presentation: 10
```

Initial proportions:

```text
45%
25%
20%
10%
```

But requirements should also influence workload.

Use:

```text
adjustedWeight = marks × complexity
```

Then normalize all adjusted weights.

Example:

```text
Implementation:
45 × 1.5 = 67.5

Testing:
25 × 1.25 = 31.25

Report:
20 × 1.0 = 20

Presentation:
10 × 0.75 = 7.5
```

Normalize these values and distribute the usable assignment workload between the tasks.

This prevents a five-minute presentation from automatically receiving the same effort-per-mark as a technically difficult implementation.

---

# Workload output

After analysis, Page 2 should show a review screen before proceeding.

Example:

```text
Recommended workload
36 hours total

Implementation
45% of marks
Frontend + API + database + deployment
~17 hours

Testing & Evaluation
25% of marks
Unit + integration + evaluation
~8 hours

Technical Report
20% of marks
2,500 words + references
~6 hours

Presentation
10% of marks
5-minute demo
~2 hours

Project buffer
~3 hours
```

The user should be able to edit the recommended total workload if it looks unrealistic.

For example:

```text
Recommended: 36h
[ - ] 36 [ + ]
```

or a simple numeric field.

If the user changes the total workload, redistribute task hours proportionally.

This gives the system transparency without claiming impossible precision.

---

# Page 3 — Generated Plan

Purpose:

Take:

- deadline;
- task workload;
- recurring commitments;

and produce actual study sessions.

This page should feel like the payoff of the application.

---

# Scheduling engine

Implement this as deterministic TypeScript logic.

Do not use AI to generate the schedule.

Input:

```ts
modules
assignment
assignmentTasks
commitments
deadline
currentDate
```

Output:

```ts
type StudyBlock = {
  id: string;
  date: string;
  start: string;
  end: string;
  taskId: string;
  taskName: string;
};
```

---

## Scheduling procedure

### 1. Generate dates

Generate every day between now and:

```text
deadline - 24 hours
```

The final 24 hours should preferably remain as deadline protection.

If there is not enough time, the scheduler may use that buffer and display a warning.

---

### 2. Generate free periods

For each date:

Start with:

```text
08:00–22:00
```

Remove recurring commitments for that weekday.

Example:

```text
08:00–22:00

Blocked:
09:00–13:00 class
17:00–18:30 gym
19:00–20:00 dinner
```

Free periods become:

```text
08:00–09:00
13:00–17:00
18:30–19:00
20:00–22:00
```

Discard periods shorter than 60 minutes.

---

### 3. Split free periods

Prefer study sessions of:

```text
60–120 minutes
```

Avoid creating one enormous four-hour session when two smaller sessions are possible.

---

### 4. Spread work across days

Avoid putting the entire assignment into the earliest available day.

Initially aim for a maximum of roughly:

```text
3 hours of this assignment per day
```

If the deadline requires more work per day, increase the limit automatically.

---

### 5. Allocate tasks in logical order

For the prototype, use the order returned by the assignment analysis.

Example:

```text
1. Implementation
2. Testing
3. Report
4. Presentation
```

A sophisticated dependency graph is not required yet.

Fill each task's required duration before moving fully onto the next task, although splitting a task across multiple sessions is expected.

---

### 6. Deadline feasibility

Calculate:

```text
total required study hours
vs
total available free study hours
```

Display:

```text
On track
```

if enough time exists.

Display a warning such as:

```text
Schedule is tight
```

if less than approximately 10% free capacity remains.

Display:

```text
Not enough available time
```

if the required workload exceeds available free time.

Do not attempt sophisticated prediction or probability scores yet.

---

# Plan page UI

Top summary card:

```text
Software Engineering Project
Due Friday 28 August at 17:00

36h recommended workload
33h planned work
3h project buffer

Status: On track
```

Then show the plan grouped by day.

Example:

```text
MONDAY

14:00–16:00
Implementation
Frontend structure

20:00–21:30
Implementation
REST API


TUESDAY

13:00–15:00
Implementation
Database

15:30–17:00
Implementation
Deployment


WEDNESDAY

14:00–16:00
Testing
Unit tests
```

Keep the presentation visually clean rather than attempting a complex calendar grid.

---

# Persistence

Use localStorage.

Suggested keys/data:

```ts
type AppState = {
  modules: Module[];
  commitments: Commitment[];
  assignments: Assignment[];
  studyBlocks: StudyBlock[];
};
```

A lightweight React context or small state hook is sufficient.

Do not introduce Redux or other heavy state-management libraries.

---

# Suggested project structure

Something approximately like:

```text
app/
  setup/
    page.tsx
  assignment/
    page.tsx
  plan/
    page.tsx

components/
  StepIndicator.tsx
  ModuleForm.tsx
  CommitmentForm.tsx
  AssignmentUpload.tsx
  WorkloadBreakdown.tsx
  StudyPlan.tsx

lib/
  storage.ts
  workload.ts
  scheduler.ts
  assignmentAnalyzer.ts

types/
  index.ts
```

Keep business logic out of page components.

---

# Assignment analyzer abstraction

Create the service now even though it is mocked.

Example interface:

```ts
interface AssignmentAnalysis {
  title: string;
  tasks: AssignmentTask[];
}
```

`assignmentAnalyzer.ts` should expose something such as:

```ts
analyzeAssignment(...)
```

For the initial implementation, return mock data.

Later this can be swapped for a Featherless/OpenAI-compatible vision API without restructuring the application.

---

# Explicitly deferred features

Do **not** implement the following in the initial build.

They are possible extensions for the later Pixel Forge version.

## AI / document processing

Do not initially build:

- real screenshot vision processing;
- PDF extraction;
- OCR pipelines;
- RAG;
- vector databases;
- embeddings;
- course-document retrieval;
- module-handbook analysis.

The UI and analyzer abstraction should merely leave room for these.

---

## Calendar functionality

Do not build:

- Google Calendar OAuth;
- Apple Calendar integration;
- Outlook integration;
- `.ics` export unless there is spare time;
- drag-and-drop scheduling.

The app owns its own simple generated plan for now.

---

## Adaptive replanning

Do not initially build:

- marking sessions complete;
- missed-session detection;
- automatic rescheduling;
- deadline risk prediction;
- "I am going out tonight, replan everything."

These are strong future features, but not required to prove the core concept tomorrow.

---

## Personalization

Do not build:

- historical productivity analysis;
- learning how quickly the user writes;
- learning programming speed;
- personalized complexity predictions;
- target grade optimization.

---

## Generic student-app features

Specifically avoid:

- flashcards;
- notes;
- Pomodoro timers;
- grade trackers;
- AI tutoring;
- chatbots;
- habit tracking;
- generic to-do lists;
- LMS integrations;
- social features.

These dilute the product.

---

## Infrastructure

Do not build:

- accounts;
- authentication;
- cloud database;
- subscription/payment systems;
- native iOS application;
- native Android application.

The MVP is a responsive web app/PWA.

---

# Immediate implementation priority

Build in this exact order.

## Phase 1

Create the application shell and routing:

```text
Setup
Assignment
Plan
```

Make navigation between all three pages work.

---

## Phase 2

Implement localStorage persistence for:

```text
modules
commitments
```

Page 1 should be fully usable.

---

## Phase 3

Implement Page 2 with:

```text
module selection
assignment title
deadline
module %
text/file input
mock Analyze button
```

Return the predefined assignment breakdown.

---

## Phase 4

Implement `workload.ts`.

It should calculate:

```text
module workload
assessment workload pool
assignment workload
buffer
normalized task workload
```

Write this as pure functions.

---

## Phase 5

Implement `scheduler.ts`.

It should:

```text
generate free slots
remove commitments
split sessions
allocate task hours
respect deadline
return StudyBlock[]
```

Keep it deterministic.

---

## Phase 6

Render the generated plan on Page 3.

At this point the entire MVP should work:

```text
Enter module
→ enter weekly commitments
→ add mock assignment
→ calculate workload
→ automatically generate study timetable
```

Only after this flow is stable should any real AI/API integration be attempted.

---

# Definition of "MVP complete"

The prototype is complete when a judge can perform this demonstration:

1. Add a 10 ECTS module.
2. Add several recurring commitments such as classes and gym.
3. Add an assignment worth 40% of the module.
4. Upload/paste an assignment brief.
5. Trigger the mocked assignment analysis.
6. See the assignment broken into rubric-weighted components.
7. See a transparent recommended workload calculation.
8. Generate a timetable that automatically fits those tasks around the existing commitments.
9. See whether the workload fits before the deadline.

That is the entire product required for the first implementation.

Do not broaden the scope until that flow is polished and reliable.