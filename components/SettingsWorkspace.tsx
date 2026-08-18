"use client";

import { useEffect, useState } from "react";
import { CALENDAR_DAYS } from "@/lib/calendarLayout";
import { DEFAULT_PLANNING_PREFERENCES, normalizePlanningPreferences } from "@/lib/planningPreferences";
import { readStoredValue, storageKeys, writeStoredValue } from "@/lib/storage";
import type { PlanningPreferences, PreferredStudyTime } from "@/types";

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

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setPreferences(normalizePlanningPreferences(readStoredValue<unknown>(storageKeys.planningPreferences, DEFAULT_PLANNING_PREFERENCES)));
      setIsLoaded(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (isLoaded) writeStoredValue(storageKeys.planningPreferences, preferences);
  }, [isLoaded, preferences]);

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
        <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">These affect where future study sessions are placed. They never change how much work an assignment needs.</p>

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
          <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">A preference, not a guarantee. PlanAround may use a different valid length to avoid an unusable short remainder or to fit the available space.</p>
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
          <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">PlanAround aims to spread each assignment around this amount per day, but can use more available time when needed to meet the deadline.</p>
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
        <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">PlanAround will try this part of each available day first, then fall back to other available times when needed. It does not remove availability outside this window.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TIME_OF_DAY_OPTIONS.map((option) => (
            <button key={option.value} type="button" onClick={() => setPreferences({ ...preferences, preferredTimeOfDay: option.value })} aria-pressed={preferences.preferredTimeOfDay === option.value} className={toggleButtonClassName(preferences.preferredTimeOfDay === option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="defaults-heading">
        <h2 id="defaults-heading" className="text-sm font-semibold">Defaults &amp; data</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setPreferences(normalizePlanningPreferences(DEFAULT_PLANNING_PREFERENCES))} className="min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-[var(--accent)]">
            Restore scheduling defaults
          </button>
          <p className="text-sm text-[var(--muted-ink)]">Saved on this device</p>
        </div>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Planning preferences are stored in this browser with the rest of your PlanAround prototype data. This only resets scheduling preferences - your Calendar, assignments and study progress are untouched.</p>
      </section>
    </div>
  );
}
