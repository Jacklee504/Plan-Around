"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { readStoredValue, storageKeys, writeStoredValue } from "@/lib/storage";
import type { Commitment, CommitmentCategory, Module } from "@/types";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const categoryLabels: Record<CommitmentCategory, string> = {
  class: "Class",
  work: "Work",
  gym: "Gym",
  meal: "Meal",
  social: "Social",
  other: "Other",
};

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted-ink)] focus:border-[var(--accent)]";

type ModuleDraft = {
  name: string;
  code: string;
  credits: string;
};

type CommitmentDraft = {
  label: string;
  dayOfWeek: string;
  start: string;
  end: string;
  category: CommitmentCategory;
};

const emptyModuleDraft: ModuleDraft = { name: "", code: "", credits: "" };
const emptyCommitmentDraft: CommitmentDraft = {
  label: "",
  dayOfWeek: "1",
  start: "09:00",
  end: "10:00",
  category: "class",
};

const createId = () => window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function SetupWorkspace() {
  const [modules, setModules] = useState<Module[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [moduleDraft, setModuleDraft] = useState<ModuleDraft>(emptyModuleDraft);
  const [commitmentDraft, setCommitmentDraft] = useState<CommitmentDraft>(emptyCommitmentDraft);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [editingCommitmentId, setEditingCommitmentId] = useState<string | null>(null);
  const [moduleError, setModuleError] = useState("");
  const [commitmentError, setCommitmentError] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const storedModules = readStoredValue<Module[]>(storageKeys.modules, []);
    const storedCommitments = readStoredValue<Commitment[]>(storageKeys.commitments, []);
    const hydrationTimer = window.setTimeout(() => {
      setModules(storedModules);
      setCommitments(storedCommitments);
      setIsLoaded(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      writeStoredValue(storageKeys.modules, modules);
    }
  }, [isLoaded, modules]);

  useEffect(() => {
    if (isLoaded) {
      writeStoredValue(storageKeys.commitments, commitments);
    }
  }, [commitments, isLoaded]);

  const sortedCommitments = useMemo(
    () => [...commitments].sort((first, second) => first.dayOfWeek - second.dayOfWeek || first.start.localeCompare(second.start)),
    [commitments],
  );

  function resetModuleForm() {
    setModuleDraft(emptyModuleDraft);
    setEditingModuleId(null);
    setModuleError("");
  }

  function resetCommitmentForm() {
    setCommitmentDraft(emptyCommitmentDraft);
    setEditingCommitmentId(null);
    setCommitmentError("");
  }

  function saveModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = moduleDraft.name.trim();
    const credits = Number(moduleDraft.credits);

    if (!name || !Number.isFinite(credits) || credits <= 0) {
      setModuleError("Add a module name and a valid ECTS value.");
      return;
    }

    const moduleEntry: Module = {
      id: editingModuleId ?? createId(),
      name,
      code: moduleDraft.code.trim() || undefined,
      credits,
    };

    setModules((currentModules) =>
      editingModuleId
        ? currentModules.map((currentModule) => (currentModule.id === editingModuleId ? moduleEntry : currentModule))
        : [...currentModules, moduleEntry],
    );
    resetModuleForm();
  }

  function saveCommitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = commitmentDraft.label.trim();
    const dayOfWeek = Number(commitmentDraft.dayOfWeek);

    if (!label || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || commitmentDraft.end <= commitmentDraft.start) {
      setCommitmentError("Add a label and a valid start and end time.");
      return;
    }

    const commitment: Commitment = {
      id: editingCommitmentId ?? createId(),
      label,
      dayOfWeek,
      start: commitmentDraft.start,
      end: commitmentDraft.end,
      category: commitmentDraft.category,
    };

    setCommitments((currentCommitments) =>
      editingCommitmentId
        ? currentCommitments.map((currentCommitment) => (currentCommitment.id === editingCommitmentId ? commitment : currentCommitment))
        : [...currentCommitments, commitment],
    );
    resetCommitmentForm();
  }

  function editModule(module: Module) {
    setModuleDraft({ name: module.name, code: module.code ?? "", credits: String(module.credits) });
    setEditingModuleId(module.id);
    setModuleError("");
  }

  function editCommitment(commitment: Commitment) {
    setCommitmentDraft({
      label: commitment.label,
      dayOfWeek: String(commitment.dayOfWeek),
      start: commitment.start,
      end: commitment.end,
      category: commitment.category,
    });
    setEditingCommitmentId(commitment.id);
    setCommitmentError("");
  }

  function loadDemoSetup() {
    setModules([
      { id: createId(), code: "CT4101", name: "Distributed Systems", credits: 10 },
      { id: createId(), code: "CT4042", name: "Software Engineering", credits: 5 },
    ]);
    setCommitments([
      { id: createId(), label: "Lectures", dayOfWeek: 1, start: "09:00", end: "13:00", category: "class" },
      { id: createId(), label: "Gym", dayOfWeek: 1, start: "17:00", end: "18:30", category: "gym" },
      { id: createId(), label: "Part-time work", dayOfWeek: 2, start: "16:00", end: "20:00", category: "work" },
      { id: createId(), label: "Tutorial", dayOfWeek: 3, start: "10:00", end: "12:00", category: "class" },
      { id: createId(), label: "Society meeting", dayOfWeek: 4, start: "18:00", end: "20:00", category: "social" },
    ]);
  }

  const hasSetup = modules.length > 0 || commitments.length > 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
      <div className="space-y-8">
        <section aria-labelledby="modules-heading" className="border-t border-[var(--line)] pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Your semester</p>
              <h2 id="modules-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Modules</h2>
            </div>
            <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-semibold text-[var(--muted-ink)]">
              {modules.length} saved
            </span>
          </div>

          <form onSubmit={saveModule} className="mt-5 grid gap-3 rounded-2xl bg-[var(--surface-soft)] p-4 sm:grid-cols-[1fr_0.55fr_0.38fr_auto] sm:items-end">
            <label className="text-sm font-medium">
              Module name
              <input
                value={moduleDraft.name}
                onChange={(event) => setModuleDraft((current) => ({ ...current, name: event.target.value }))}
                className={inputClassName}
                placeholder="Distributed Systems"
                autoComplete="off"
              />
            </label>
            <label className="text-sm font-medium">
              Code <span className="font-normal text-[var(--muted-ink)]">optional</span>
              <input
                value={moduleDraft.code}
                onChange={(event) => setModuleDraft((current) => ({ ...current, code: event.target.value }))}
                className={inputClassName}
                placeholder="CT4101"
                autoComplete="off"
              />
            </label>
            <label className="text-sm font-medium">
              ECTS
              <input
                value={moduleDraft.credits}
                onChange={(event) => setModuleDraft((current) => ({ ...current, credits: event.target.value }))}
                className={inputClassName}
                type="number"
                min="0.5"
                step="0.5"
                inputMode="decimal"
                placeholder="10"
              />
            </label>
            <button type="submit" className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">
              {editingModuleId ? "Save" : "Add module"}
            </button>
            {editingModuleId ? (
              <button type="button" onClick={resetModuleForm} className="text-left text-sm font-semibold text-[var(--accent-strong)] sm:col-span-4">
                Cancel editing
              </button>
            ) : null}
            {moduleError ? <p className="text-sm text-red-700 sm:col-span-4">{moduleError}</p> : null}
          </form>

          <div className="mt-3 space-y-2" aria-live="polite">
            {modules.length ? (
              modules.map((module) => (
                <div key={module.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{module.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--muted-ink)]">{module.code ? `${module.code} · ` : ""}{module.credits} ECTS</p>
                  </div>
                  <div className="flex shrink-0 gap-3 text-sm font-semibold">
                    <button type="button" onClick={() => editModule(module)} className="text-[var(--accent-strong)]">Edit</button>
                    <button type="button" onClick={() => setModules((current) => current.filter((item) => item.id !== module.id))} className="text-red-700">Delete</button>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-5 text-sm leading-6 text-[var(--muted-ink)]">Add the module this assignment belongs to. ECTS helps set a realistic effort baseline.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="commitments-heading" className="border-t border-[var(--line)] pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Your real week</p>
              <h2 id="commitments-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Recurring commitments</h2>
            </div>
            <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-semibold text-[var(--muted-ink)]">
              {commitments.length} blocked
            </span>
          </div>

          <form onSubmit={saveCommitment} className="mt-5 grid gap-3 rounded-2xl bg-[var(--surface-soft)] p-4 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">
              What is this time for?
              <input
                value={commitmentDraft.label}
                onChange={(event) => setCommitmentDraft((current) => ({ ...current, label: event.target.value }))}
                className={inputClassName}
                placeholder="Monday lectures"
                autoComplete="off"
              />
            </label>
            <label className="text-sm font-medium">
              Day
              <select
                value={commitmentDraft.dayOfWeek}
                onChange={(event) => setCommitmentDraft((current) => ({ ...current, dayOfWeek: event.target.value }))}
                className={inputClassName}
              >
                {days.map((day, index) => <option key={day} value={index}>{day}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Category
              <select
                value={commitmentDraft.category}
                onChange={(event) => setCommitmentDraft((current) => ({ ...current, category: event.target.value as CommitmentCategory }))}
                className={inputClassName}
              >
                {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Start
              <input
                value={commitmentDraft.start}
                onChange={(event) => setCommitmentDraft((current) => ({ ...current, start: event.target.value }))}
                className={inputClassName}
                type="time"
              />
            </label>
            <label className="text-sm font-medium">
              End
              <input
                value={commitmentDraft.end}
                onChange={(event) => setCommitmentDraft((current) => ({ ...current, end: event.target.value }))}
                className={inputClassName}
                type="time"
              />
            </label>
            <div className="sm:col-span-2 sm:flex sm:items-center sm:justify-between sm:gap-4">
              {editingCommitmentId ? (
                <button type="button" onClick={resetCommitmentForm} className="mt-3 text-sm font-semibold text-[var(--accent-strong)] sm:mt-0">
                  Cancel editing
                </button>
              ) : <span />}
              <button type="submit" className="mt-3 min-h-11 w-full rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] sm:mt-0 sm:w-auto">
                {editingCommitmentId ? "Save commitment" : "Add commitment"}
              </button>
            </div>
            {commitmentError ? <p className="text-sm text-red-700 sm:col-span-2">{commitmentError}</p> : null}
          </form>

          <div className="mt-3 space-y-5" aria-live="polite">
            {sortedCommitments.length ? (
              days.map((day, dayOfWeek) => {
                const dayCommitments = sortedCommitments.filter((commitment) => commitment.dayOfWeek === dayOfWeek);
                if (!dayCommitments.length) return null;

                return (
                  <div key={day}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted-ink)]">{day}</p>
                    <div className="space-y-2">
                      {dayCommitments.map((commitment) => (
                        <div key={commitment.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{commitment.label}</p>
                            <p className="mt-0.5 text-xs text-[var(--muted-ink)]">{commitment.start}–{commitment.end} · {categoryLabels[commitment.category]}</p>
                          </div>
                          <div className="flex shrink-0 gap-3 text-sm font-semibold">
                            <button type="button" onClick={() => editCommitment(commitment)} className="text-[var(--accent-strong)]">Edit</button>
                            <button type="button" onClick={() => setCommitments((current) => current.filter((item) => item.id !== commitment.id))} className="text-red-700">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-5 text-sm leading-6 text-[var(--muted-ink)]">Block out the recurring time you would not normally study. Commitments are optional, but they make the plan more believable.</p>
            )}
          </div>
        </section>
      </div>

      <aside className="h-fit rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 lg:sticky lg:top-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Setup status</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Ready to plan?</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">Your details are stored in this browser. They will be used in the next step to anchor the assignment workload.</p>

        <dl className="mt-6 space-y-3 border-y border-[var(--line)] py-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-[var(--muted-ink)]">Modules</dt><dd className="font-semibold">{modules.length}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-[var(--muted-ink)]">Blocked periods</dt><dd className="font-semibold">{commitments.length}</dd></div>
        </dl>

        {!hasSetup ? (
          <button type="button" onClick={loadDemoSetup} className="mt-5 min-h-11 w-full rounded-xl border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]">
            Load demo setup
          </button>
        ) : null}

        {modules.length ? (
          <Link href="/assignment" className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">
            Continue to assignment
          </Link>
        ) : (
          <p className="mt-5 text-sm leading-6 text-[var(--muted-ink)]">Add at least one module to continue.</p>
        )}
      </aside>
    </div>
  );
}
