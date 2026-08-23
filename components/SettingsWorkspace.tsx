"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { CALENDAR_DAYS } from "@/lib/calendarLayout";
import { applyPlanAroundImport, buildPlanAroundExport, parsePlanAroundExport, serializePlanAroundExport } from "@/lib/dataPortability";
import { buildAssignmentCalendarIcs } from "@/lib/icsExport";
import { createPlanFingerprint, getReservableAssignmentSessions } from "@/lib/planSnapshot";
import { DEFAULT_PLANNING_PREFERENCES, normalizePlanningPreferences } from "@/lib/planningPreferences";
import { resetForNewSemester } from "@/lib/semesterReset";
import { generateAssignmentSchedule } from "@/lib/scheduler";
import { clearPlanAroundStorage, readStoredValue, storageKeys, writeStoredValue } from "@/lib/storage";
import { calculateRemainingWorkload, replaceIncompleteBlocksForAssignment } from "@/lib/assignmentProgress";
import {
  getNotificationPermission,
  isNotificationSupported,
  readNotificationsEnabled,
  requestNotificationPermission,
  writeNotificationsEnabled,
} from "@/lib/assignmentNotifications";
import { calculateWorkloadBreakdown } from "@/lib/workload";
import type { Assignment, Commitment, DatedCommitment, Module, PlanningPreferences, PreferredAssignmentTime, AssignmentSession, TimetableEntry } from "@/types";

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const SESSION_LENGTH_OPTIONS: PlanningPreferences["preferredSessionMinutes"][] = [60, 90, 120];
const DAILY_TARGET_OPTIONS: PlanningPreferences["dailyAssignmentTargetMinutes"][] = [120, 180, 240, 300];
const TIME_OF_DAY_OPTIONS: { value: PreferredAssignmentTime; label: string }[] = [
  { value: "none", label: "No preference" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];

function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${remainder}`;
}

function toggleButtonClassName(selected: boolean) {
  return `min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors ${
    selected
      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
      : "border-[var(--line)] text-[var(--muted-ink)] hover:border-[var(--accent)]"
  }`;
}

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted-ink)] focus:border-[var(--accent)]";

export function SettingsWorkspace() {
  const router = useRouter();
  const [preferences, setPreferences] = useState<PlanningPreferences>(DEFAULT_PLANNING_PREFERENCES);
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setPreferences(normalizePlanningPreferences(readStoredValue<unknown>(storageKeys.planningPreferences, DEFAULT_PLANNING_PREFERENCES)));
      const storedModules = readStoredValue<Module[]>(storageKeys.modules, []);
      const storedAssignments = readStoredValue<Assignment[]>(storageKeys.assignments, []);
      const activeAssignmentId = readStoredValue<string>(storageKeys.activeAssignmentId, "");
      const matchingAssignment = storedAssignments.find((assignment) =>
        assignment.id === activeAssignmentId &&
        storedModules.some((module) => module.id === assignment.moduleId),
      );
      setActiveAssignment(matchingAssignment ?? null);
      setNotificationSupported(isNotificationSupported());
      setNotificationPermission(getNotificationPermission());
      setNotificationsEnabled(readNotificationsEnabled());
      setIsLoaded(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (isLoaded) writeStoredValue(storageKeys.planningPreferences, preferences);
  }, [isLoaded, preferences]);

  function downloadTextFile(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportData() {
    const today = new Date().toISOString().slice(0, 10);
    downloadTextFile(`planaround-backup-${today}.json`, serializePlanAroundExport(buildPlanAroundExport()), "application/json");
    setDataMessage("Backup downloaded.");
  }

  function downloadIcs() {
    const ics = buildAssignmentCalendarIcs({
      assignmentSessions: readStoredValue<AssignmentSession[]>(storageKeys.assignmentSessions, []),
      timetableEntries: readStoredValue<TimetableEntry[]>(storageKeys.timetableEntries, []),
      commitments: readStoredValue<Commitment[]>(storageKeys.commitments, []),
      datedCommitments: readStoredValue<DatedCommitment[]>(storageKeys.datedCommitments, []),
    });
    downloadTextFile("planaround-calendar.ics", ics, "text/calendar");
  }

  function startNewSemester() {
    if (
      !window.confirm(
        "This downloads a backup of your current timetable, modules, commitments and assignments, then clears them so you can set up a new term. Your scheduling preferences are kept. Continue?",
      )
    )
      return;

    const today = new Date().toISOString().slice(0, 10);
    downloadTextFile(`planaround-semester-backup-${today}.json`, serializePlanAroundExport(buildPlanAroundExport()), "application/json");
    resetForNewSemester();
    window.location.reload();
  }

  function clearAllData() {
    if (
      !window.confirm(
        "This permanently deletes all PlanAround data on this device, including your timetable, assignments, plans, preferences and reminders. It cannot be undone. Continue?",
      )
    )
      return;

    clearPlanAroundStorage();
    router.replace("/setup");
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const parsed = parsePlanAroundExport(await file.text());
    if (!parsed) {
      setDataMessage("That file doesn't look like a PlanAround backup.");
      return;
    }

    if (!window.confirm("Importing will overwrite all current PlanAround data on this device. Continue?")) return;

    applyPlanAroundImport(parsed);
    window.location.reload();
  }

  async function enableNotifications() {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      writeNotificationsEnabled(true);
      setNotificationsEnabled(true);
    }
  }

  function toggleNotifications() {
    const next = !notificationsEnabled;
    writeNotificationsEnabled(next);
    setNotificationsEnabled(next);
  }

  function updateAssignmentStart(nextStart: string) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nextStart)) return;
    const nextEnd = minutesFromTime(preferences.assignmentEnd) - minutesFromTime(nextStart) < 60
      ? timeFromMinutes(Math.min(minutesFromTime(nextStart) + 60, minutesFromTime(DEFAULT_PLANNING_PREFERENCES.assignmentEnd)))
      : preferences.assignmentEnd;
    setPreferences({ ...preferences, assignmentStart: nextStart, assignmentEnd: nextEnd });
  }

  function updateAssignmentEnd(nextEnd: string) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nextEnd)) return;
    const nextStart = minutesFromTime(nextEnd) - minutesFromTime(preferences.assignmentStart) < 60
      ? timeFromMinutes(Math.max(minutesFromTime(nextEnd) - 60, minutesFromTime(DEFAULT_PLANNING_PREFERENCES.assignmentStart)))
      : preferences.assignmentStart;
    setPreferences({ ...preferences, assignmentStart: nextStart, assignmentEnd: nextEnd });
  }

  function toggleAssignmentDay(day: number) {
    const isEnabled = preferences.enabledAssignmentDays.includes(day);
    // At least one assignment day must always remain enabled.
    if (isEnabled && preferences.enabledAssignmentDays.length <= 1) return;

    const enabledAssignmentDays = isEnabled
      ? preferences.enabledAssignmentDays.filter((enabledDay) => enabledDay !== day)
      : [...preferences.enabledAssignmentDays, day].sort((first, second) => first - second);
    setPreferences({ ...preferences, enabledAssignmentDays });
  }

  function updateActivePlan() {
    const activeAssignmentId = readStoredValue<string>(storageKeys.activeAssignmentId, "");
    const assignments = readStoredValue<Assignment[]>(storageKeys.assignments, []);
    const modules = readStoredValue<Module[]>(storageKeys.modules, []);
    const assignment = assignments.find((item) => item.id === activeAssignmentId);
    const assignmentModule = assignment
      ? modules.find((item) => item.id === assignment.moduleId)
      : undefined;

    if (!assignment || !assignmentModule) {
      setActiveAssignment(null);
      return;
    }

    // Write before navigating so Plan loads the exact preference set that
    // shaped this updated schedule on its first render.
    const nextPreferences = normalizePlanningPreferences(preferences);
    writeStoredValue(storageKeys.planningPreferences, nextPreferences);

    const timetableEntries = readStoredValue<TimetableEntry[]>(storageKeys.timetableEntries, []);
    const commitments = readStoredValue<Commitment[]>(storageKeys.commitments, []);
    const datedCommitments = readStoredValue<DatedCommitment[]>(storageKeys.datedCommitments, []);
    const assignmentSessions = readStoredValue<AssignmentSession[]>(storageKeys.assignmentSessions, []);
    const planSnapshots = readStoredValue<Record<string, string>>(storageKeys.planSnapshots, {});
    const workload = calculateWorkloadBreakdown(assignmentModule.credits, assignment);
    const completedBlocks = assignmentSessions.filter(
      (block) => block.assignmentId === assignment.id && block.completedAt,
    );
    const remainingWorkload = calculateRemainingWorkload(workload, completedBlocks);
    const reservedBlocks = getReservableAssignmentSessions({
      currentAssignmentId: assignment.id,
      assignments,
      modules,
      assignmentSessions,
      planSnapshots,
      timetableEntries,
      commitments,
      datedCommitments,
      planningPreferences: nextPreferences,
    });
    const scheduled = generateAssignmentSchedule({
      assignment,
      workload: remainingWorkload,
      timetableEntries,
      commitments,
      datedCommitments,
      reservedBlocks: [...reservedBlocks, ...completedBlocks],
      preferences: nextPreferences,
    });

    writeStoredValue(
      storageKeys.assignmentSessions,
      replaceIncompleteBlocksForAssignment(assignmentSessions, assignment.id, scheduled.assignmentSessions),
    );
    writeStoredValue(storageKeys.planSnapshots, {
      ...planSnapshots,
      [assignment.id]: createPlanFingerprint({
        assignment,
        module: assignmentModule,
        timetableEntries,
        commitments,
        datedCommitments,
        planningPreferences: nextPreferences,
      }),
    });
    router.push(`/plan?assignment=${encodeURIComponent(assignment.id)}`);
  }

  if (!isLoaded) {
    return <div className="h-44 animate-pulse border-y border-[var(--line)] bg-[var(--surface-soft)]" aria-label="Loading settings" />;
  }

  return (
    <div className="space-y-10">
      <section className="border-y border-[var(--line)] py-6" aria-labelledby="availability-heading">
        <h2 id="availability-heading" className="text-xl font-semibold tracking-[-0.03em]">When you have time</h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Choose the parts of your week that PlanAround may use for assignment work.</p>

        <div className="mt-5">
          <p className="text-sm font-medium">Available days</p>
          <div className="mt-2 grid max-w-xl grid-cols-7 gap-1.5">
            {CALENDAR_DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleAssignmentDay(day)}
                aria-pressed={preferences.enabledAssignmentDays.includes(day)}
                className={toggleButtonClassName(preferences.enabledAssignmentDays.includes(day))}
              >
                {dayLabels[day].slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid max-w-xl gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Earliest start
            <input
              value={preferences.assignmentStart}
              onChange={(event) => updateAssignmentStart(event.target.value)}
              className={inputClassName}
              type="time"
              min="08:00"
              max={timeFromMinutes(minutesFromTime(preferences.assignmentEnd) - 60)}
            />
          </label>
          <label className="text-sm font-medium">
            Latest finish
            <input
              value={preferences.assignmentEnd}
              onChange={(event) => updateAssignmentEnd(event.target.value)}
              className={inputClassName}
              type="time"
              min={timeFromMinutes(minutesFromTime(preferences.assignmentStart) + 60)}
              max="22:00"
            />
          </label>
        </div>
      </section>

      <section className="border-b border-[var(--line)] pb-8" aria-labelledby="session-preferences-heading">
        <h2 id="session-preferences-heading" className="text-xl font-semibold tracking-[-0.03em]">How to plan your sessions</h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">These guide the plan when more than one valid time is available.</p>

        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium">Preferred session length</p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">Usually schedule work in sessions around this long.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SESSION_LENGTH_OPTIONS.map((minutes) => (
                <button key={minutes} type="button" onClick={() => setPreferences({ ...preferences, preferredSessionMinutes: minutes })} aria-pressed={preferences.preferredSessionMinutes === minutes} className={toggleButtonClassName(preferences.preferredSessionMinutes === minutes)}>
                  {minutes} min
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium">Daily work target</p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">Aim for this much assignment work on each day.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAILY_TARGET_OPTIONS.map((minutes) => (
                <button key={minutes} type="button" onClick={() => setPreferences({ ...preferences, dailyAssignmentTargetMinutes: minutes })} aria-pressed={preferences.dailyAssignmentTargetMinutes === minutes} className={toggleButtonClassName(preferences.dailyAssignmentTargetMinutes === minutes)}>
                  {minutes / 60}h
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium">Preferred time of day</p>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">Use this part of a free day first, when possible.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TIME_OF_DAY_OPTIONS.map((option) => (
              <button key={option.value} type="button" onClick={() => setPreferences({ ...preferences, preferredTimeOfDay: option.value })} aria-pressed={preferences.preferredTimeOfDay === option.value} className={toggleButtonClassName(preferences.preferredTimeOfDay === option.value)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm text-[var(--muted-ink)]">Changes save automatically.</p>
          <button type="button" onClick={() => setPreferences(normalizePlanningPreferences(DEFAULT_PLANNING_PREFERENCES))} className="text-sm font-semibold text-[var(--accent-strong)] underline underline-offset-2">
            Restore defaults
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--accent)] bg-[var(--accent-soft)] px-5 py-5" aria-labelledby="update-plan-heading">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Current assignment</p>
        <h2 id="update-plan-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Update its plan</h2>
        {activeAssignment ? (
          <>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]"><span className="font-semibold text-[var(--ink)]">{activeAssignment.title}</span> will be rescheduled using these preferences. Completed sessions stay unchanged.</p>
            <button type="button" onClick={updateActivePlan} className="mt-4 min-h-11 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">
              Update assignment plan
            </button>
          </>
        ) : (
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Open an assignment plan first, then return here to reschedule its remaining sessions.</p>
        )}
      </section>

      <section className="border-t border-[var(--line)] pt-8" aria-labelledby="other-preferences-heading">
        <h2 id="other-preferences-heading" className="text-xl font-semibold tracking-[-0.03em]">Other</h2>

        <div className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          <details className="py-4">
            <summary className="cursor-pointer text-sm font-semibold marker:text-[var(--muted-ink)]">Session reminders</summary>
            <div className="mt-3">
              {!notificationSupported ? (
                <p className="text-sm leading-6 text-[var(--muted-ink)]">This browser doesn&apos;t support reminders.</p>
              ) : notificationPermission === "denied" ? (
                <p className="text-sm leading-6 text-[var(--muted-ink)]">Reminders are blocked for this site in your browser settings.</p>
              ) : notificationPermission !== "granted" ? (
                <>
                  <p className="max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Get a reminder 15 minutes before a scheduled session, while PlanAround is open in this browser.</p>
                  <button type="button" onClick={enableNotifications} className="mt-3 min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-[var(--accent)]">
                    Enable reminders
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={toggleNotifications} aria-pressed={notificationsEnabled} className={`mt-1 ${toggleButtonClassName(notificationsEnabled)}`}>
                    {notificationsEnabled ? "Reminders on" : "Reminders off"}
                  </button>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Reminders appear 15 minutes before a scheduled session while PlanAround is open in this browser.</p>
                </>
              )}
            </div>
          </details>

          <details className="py-4">
            <summary className="cursor-pointer text-sm font-semibold marker:text-[var(--muted-ink)]">Data and calendar</summary>
            <div className="mt-3">
              <p className="max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Everything is stored only in this browser. Back up your data before clearing browser storage or moving to another device.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={exportData} className="min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-[var(--accent)]">
                  Export backup
                </button>
                <button type="button" onClick={() => importFileInputRef.current?.click()} className="min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-[var(--accent)]">
                  Import backup
                </button>
                <button type="button" onClick={downloadIcs} className="min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-[var(--accent)]">
                  Download calendar
                </button>
                <input ref={importFileInputRef} type="file" accept="application/json" onChange={handleImportFile} className="hidden" aria-hidden="true" tabIndex={-1} />
              </div>
              {dataMessage ? <p className="mt-3 text-sm text-[var(--muted-ink)]" role="status">{dataMessage}</p> : null}

              <div className="mt-5 border-t border-[var(--line)] pt-4">
                <p className="text-sm font-medium">Start a new semester</p>
                <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Download a backup, then clear this term&apos;s timetable, assignments and plans. Your preferences stay saved.</p>
                <button type="button" onClick={startNewSemester} className="mt-3 min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-red-300 hover:text-red-700">
                  Start new semester
                </button>
              </div>
            </div>
          </details>
        </div>
      </section>

      <section className="border-t border-red-200 pt-6" aria-labelledby="clear-data-heading">
        <h2 id="clear-data-heading" className="text-sm font-semibold text-red-800">Clear all PlanAround data</h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Permanently remove your timetable, assignments, plans, preferences and reminders from this device. This does not create a backup.</p>
        <button type="button" onClick={clearAllData} className="mt-3 min-h-10 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 transition-colors hover:border-red-400 hover:bg-red-50">
          Clear all data
        </button>
      </section>
    </div>
  );
}
