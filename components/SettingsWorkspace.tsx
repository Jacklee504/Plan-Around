"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { CALENDAR_DAYS } from "@/lib/calendarLayout";
import { applyPlanAroundImport, buildPlanAroundExport, parsePlanAroundExport, serializePlanAroundExport } from "@/lib/dataPortability";
import { buildStudyCalendarIcs } from "@/lib/icsExport";
import { DEFAULT_PLANNING_PREFERENCES, normalizePlanningPreferences } from "@/lib/planningPreferences";
import { resetForNewSemester } from "@/lib/semesterReset";
import { readStoredValue, storageKeys, writeStoredValue } from "@/lib/storage";
import {
  getNotificationPermission,
  isNotificationSupported,
  readNotificationsEnabled,
  requestNotificationPermission,
  writeNotificationsEnabled,
} from "@/lib/studyNotifications";
import type { Commitment, DatedCommitment, PlanningPreferences, PreferredStudyTime, StudyBlock, TimetableEntry } from "@/types";

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const SESSION_LENGTH_OPTIONS: PlanningPreferences["preferredSessionMinutes"][] = [60, 90, 120];
const DAILY_TARGET_OPTIONS: PlanningPreferences["dailyStudyTargetMinutes"][] = [120, 180, 240, 300];
const TIME_OF_DAY_OPTIONS: { value: PreferredStudyTime; label: string }[] = [
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

// 08:00 through 22:00 in 30-minute steps, matching the Calendar's own visible range.
const STUDY_WINDOW_OPTIONS = Array.from({ length: 29 }, (_, index) => timeFromMinutes(8 * 60 + index * 30));

function toggleButtonClassName(selected: boolean) {
  return `min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors ${
    selected
      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
      : "border-[var(--line)] text-[var(--muted-ink)] hover:border-[var(--accent)]"
  }`;
}

const selectClassName =
  "mt-1.5 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)]";

export function SettingsWorkspace() {
  const [preferences, setPreferences] = useState<PlanningPreferences>(DEFAULT_PLANNING_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setPreferences(normalizePlanningPreferences(readStoredValue<unknown>(storageKeys.planningPreferences, DEFAULT_PLANNING_PREFERENCES)));
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
    const ics = buildStudyCalendarIcs({
      studyBlocks: readStoredValue<StudyBlock[]>(storageKeys.studyBlocks, []),
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

  function updateStudyStart(nextStart: string) {
    const nextEnd = minutesFromTime(preferences.studyEnd) - minutesFromTime(nextStart) < 60
      ? timeFromMinutes(Math.min(minutesFromTime(nextStart) + 60, minutesFromTime(DEFAULT_PLANNING_PREFERENCES.studyEnd)))
      : preferences.studyEnd;
    setPreferences({ ...preferences, studyStart: nextStart, studyEnd: nextEnd });
  }

  function updateStudyEnd(nextEnd: string) {
    const nextStart = minutesFromTime(nextEnd) - minutesFromTime(preferences.studyStart) < 60
      ? timeFromMinutes(Math.max(minutesFromTime(nextEnd) - 60, minutesFromTime(DEFAULT_PLANNING_PREFERENCES.studyStart)))
      : preferences.studyStart;
    setPreferences({ ...preferences, studyStart: nextStart, studyEnd: nextEnd });
  }

  function toggleStudyDay(day: number) {
    const isEnabled = preferences.enabledStudyDays.includes(day);
    // At least one study day must always remain enabled.
    if (isEnabled && preferences.enabledStudyDays.length <= 1) return;

    const enabledStudyDays = isEnabled
      ? preferences.enabledStudyDays.filter((enabledDay) => enabledDay !== day)
      : [...preferences.enabledStudyDays, day].sort((first, second) => first - second);
    setPreferences({ ...preferences, enabledStudyDays });
  }

  const startOptions = STUDY_WINDOW_OPTIONS.filter((time) => minutesFromTime(preferences.studyEnd) - minutesFromTime(time) >= 60);
  const endOptions = STUDY_WINDOW_OPTIONS.filter((time) => minutesFromTime(time) - minutesFromTime(preferences.studyStart) >= 60);

  if (!isLoaded) {
    return <div className="h-44 animate-pulse border-y border-[var(--line)] bg-[var(--surface-soft)]" aria-label="Loading settings" />;
  }

  return (
    <div className="space-y-9">
      <section className="border-y border-[var(--line)] pb-6" aria-labelledby="study-window-heading">
        <h2 id="study-window-heading" className="text-sm font-semibold">When to study</h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Set the earliest start and latest finish for scheduled sessions.</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Earliest start
            <select value={preferences.studyStart} onChange={(event) => updateStudyStart(event.target.value)} className={selectClassName}>
              {startOptions.map((time) => <option key={time} value={time}>{time}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Latest finish
            <select value={preferences.studyEnd} onChange={(event) => updateStudyEnd(event.target.value)} className={selectClassName}>
              {endOptions.map((time) => <option key={time} value={time}>{time}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-5">
          <p className="text-sm font-medium">Study days</p>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {CALENDAR_DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleStudyDay(day)}
                aria-pressed={preferences.enabledStudyDays.includes(day)}
                className={toggleButtonClassName(preferences.enabledStudyDays.includes(day))}
              >
                {dayLabels[day].slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--line)] pb-6" aria-labelledby="session-structure-heading">
        <h2 id="session-structure-heading" className="text-sm font-semibold">How to structure sessions</h2>

        <div className="mt-4">
          <p className="text-sm font-medium">Preferred session length</p>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">A preference, not a guarantee. PlanAround may use a different valid length to avoid an unusable short remainder or to fit the available space.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SESSION_LENGTH_OPTIONS.map((minutes) => (
              <button key={minutes} type="button" onClick={() => setPreferences({ ...preferences, preferredSessionMinutes: minutes })} aria-pressed={preferences.preferredSessionMinutes === minutes} className={toggleButtonClassName(preferences.preferredSessionMinutes === minutes)}>
                {minutes} min
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm font-medium">Daily study target</p>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">PlanAround aims to spread each assignment around this amount per day, but can use more available time when needed to meet the deadline.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DAILY_TARGET_OPTIONS.map((minutes) => (
              <button key={minutes} type="button" onClick={() => setPreferences({ ...preferences, dailyStudyTargetMinutes: minutes })} aria-pressed={preferences.dailyStudyTargetMinutes === minutes} className={toggleButtonClassName(preferences.dailyStudyTargetMinutes === minutes)}>
                {minutes / 60}h
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--line)] pb-6" aria-labelledby="time-of-day-heading">
        <h2 id="time-of-day-heading" className="text-sm font-semibold">When to prioritise</h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">PlanAround will try this part of each available day first, then fall back to other available times when needed. It does not remove availability outside this window.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TIME_OF_DAY_OPTIONS.map((option) => (
            <button key={option.value} type="button" onClick={() => setPreferences({ ...preferences, preferredTimeOfDay: option.value })} aria-pressed={preferences.preferredTimeOfDay === option.value} className={toggleButtonClassName(preferences.preferredTimeOfDay === option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="border-b border-[var(--line)] pb-6" aria-labelledby="notifications-heading">
        <h2 id="notifications-heading" className="text-sm font-semibold">Notifications</h2>
        {!notificationSupported ? (
          <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">This browser doesn&apos;t support notifications.</p>
        ) : notificationPermission === "denied" ? (
          <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">Notifications are blocked for this site in your browser settings.</p>
        ) : notificationPermission !== "granted" ? (
          <>
            <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Get a browser notification 15 minutes before a scheduled study session starts, while a PlanAround tab is open.</p>
            <button type="button" onClick={enableNotifications} className="mt-3 min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-[var(--accent)]">
              Enable session reminders
            </button>
          </>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={toggleNotifications} aria-pressed={notificationsEnabled} className={toggleButtonClassName(notificationsEnabled)}>
                {notificationsEnabled ? "Reminders on" : "Reminders off"}
              </button>
            </div>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">A notification appears about 15 minutes before a scheduled study session starts. This only fires while a PlanAround tab is open in this browser.</p>
          </>
        )}
      </section>

      <section aria-labelledby="defaults-heading">
        <h2 id="defaults-heading" className="text-sm font-semibold">Defaults &amp; data</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setPreferences(normalizePlanningPreferences(DEFAULT_PLANNING_PREFERENCES))} className="min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-[var(--accent)]">
            Restore scheduling defaults
          </button>
          <p className="text-sm text-[var(--muted-ink)]">Saved on this device</p>
        </div>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Planning preferences are stored in this browser with the rest of your PlanAround data. This only resets scheduling preferences - your Calendar, assignments and study progress are untouched.</p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" onClick={exportData} className="min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-[var(--accent)]">
            Export backup (.json)
          </button>
          <button type="button" onClick={() => importFileInputRef.current?.click()} className="min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-[var(--accent)]">
            Import backup
          </button>
          <button type="button" onClick={downloadIcs} className="min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-[var(--accent)]">
            Download calendar (.ics)
          </button>
          <input ref={importFileInputRef} type="file" accept="application/json" onChange={handleImportFile} className="hidden" aria-hidden="true" tabIndex={-1} />
        </div>
        {dataMessage ? <p className="mt-3 text-sm text-[var(--muted-ink)]" role="status">{dataMessage}</p> : null}
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">PlanAround has no account or cloud sync - all data lives only in this browser. Export a backup to move it to another device or protect against clearing your browser data. Importing a backup overwrites everything currently stored here. The calendar download covers study sessions, classes and commitments as a read-only .ics file for Google/Outlook/Apple Calendar.</p>

        <div className="mt-6 border-t border-[var(--line)] pt-5">
          <p className="text-sm font-medium">New semester</p>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Downloads a backup, then clears your timetable, modules, commitments and assignments so you can set up a new term from scratch. Scheduling preferences are kept.</p>
          <button type="button" onClick={startNewSemester} className="mt-3 min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-red-300 hover:text-red-700">
            Start new semester
          </button>
        </div>
      </section>
    </div>
  );
}
