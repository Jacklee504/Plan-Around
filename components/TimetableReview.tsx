"use client";

import { useState } from "react";
import {
  WeeklyCalendar,
  type CalendarSlot,
} from "@/components/WeeklyCalendar";
import type {
  TimetableAnalysisEntry,
  TimetableAnalysisSessionType,
  TimetableWeekday,
} from "@/lib/timetableAnalysis";
import type { TimetableEntry } from "@/types";

const weekdays: TimetableWeekday[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted-ink)] focus:border-[var(--accent)]";

type TimetableReviewProps = {
  entries: TimetableAnalysisEntry[];
  warnings: string[];
  error?: string;
  onChange: (entries: TimetableAnalysisEntry[]) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

const emptyEntry: TimetableAnalysisEntry = {
  moduleCode: null,
  moduleName: null,
  day: "Monday",
  start: "09:00",
  end: "10:00",
  sessionType: "other",
};

function plusHour(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const endMinutes = Math.min(hour * 60 + minute + 60, 22 * 60);
  return `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(
    endMinutes % 60,
  ).padStart(2, "0")}`;
}

function draftEntryId(index: number) {
  return `draft-session-${index}`;
}

function asCalendarEntries(entries: TimetableAnalysisEntry[]): TimetableEntry[] {
  return entries.map((entry, index) => ({
    id: draftEntryId(index),
    moduleCode: entry.moduleCode?.trim() || "Code needed",
    moduleName: entry.moduleName?.trim() || "Module name needed",
    dayOfWeek: days.indexOf(entry.day),
    start: entry.start,
    end: entry.end,
    sessionType: entry.sessionType,
    attendance: "attending",
    skippedWeeks: [],
  }));
}

function DraftTeachingSessionDialog({
  entry,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  entry: TimetableAnalysisEntry;
  isNew: boolean;
  onSave: (entry: TimetableAnalysisEntry) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(entry);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.18_0.02_260_/_0.35)] p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <form
        className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...draft,
            moduleCode: draft.moduleCode?.trim() || null,
            moduleName: draft.moduleName?.trim() || null,
          });
        }}
        onMouseDown={(event) => event.stopPropagation()}
        aria-labelledby="draft-session-heading"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">
              Draft timetable
            </p>
            <h2
              id="draft-session-heading"
              className="mt-1 text-xl font-semibold tracking-[-0.03em]"
            >
              {isNew ? "Add teaching session" : "Edit teaching session"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 px-2 text-sm font-semibold text-[var(--muted-ink)] hover:text-[var(--ink)]"
          >
            Close
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Module code
            <input
              value={draft.moduleCode ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, moduleCode: event.target.value || null })
              }
              className={inputClassName}
              placeholder="CS301"
              autoFocus
              autoComplete="off"
            />
          </label>
          <label className="text-sm font-medium">
            Module name
            <input
              value={draft.moduleName ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, moduleName: event.target.value || null })
              }
              className={inputClassName}
              placeholder="Software Engineering"
              autoComplete="off"
            />
          </label>
          <label className="text-sm font-medium">
            Day
            <select
              value={draft.day}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  day: event.target.value as TimetableWeekday,
                })
              }
              className={inputClassName}
            >
              {weekdays.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Type
            <select
              value={draft.sessionType}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  sessionType: event.target
                    .value as TimetableAnalysisSessionType,
                })
              }
              className={inputClassName}
            >
              <option value="lecture">Lecture</option>
              <option value="lab">Lab</option>
              <option value="tutorial">Tutorial</option>
              <option value="other">Class</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Start
            <input
              value={draft.start}
              onChange={(event) =>
                setDraft({ ...draft, start: event.target.value })
              }
              className={inputClassName}
              type="time"
            />
          </label>
          <label className="text-sm font-medium">
            End
            <input
              value={draft.end}
              onChange={(event) =>
                setDraft({ ...draft, end: event.target.value })
              }
              className={inputClassName}
              type="time"
            />
          </label>
        </div>
        <div className="mt-6 flex flex-wrap justify-between gap-3">
          <div>
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="min-h-11 px-2 text-sm font-semibold text-red-700 hover:text-red-900"
              >
                Delete
              </button>
            ) : null}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] hover:border-[var(--accent)]"
            >
              Close
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function TimetableReview({
  entries,
  warnings,
  error,
  onChange,
  onConfirm,
  onCancel,
}: TimetableReviewProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [addingSession, setAddingSession] = useState(false);
  const [newSession, setNewSession] = useState(emptyEntry);
  const calendarEntries = asCalendarEntries(entries);
  const editingEntry =
    editingIndex === null ? null : (entries[editingIndex] ?? null);

  function openNewSession(slot?: CalendarSlot) {
    setEditingIndex(null);
    setAddingSession(true);
    setNewSession(
      slot
        ? {
            ...emptyEntry,
            day: days[slot.dayOfWeek] as TimetableWeekday,
            start: slot.start,
            end: plusHour(slot.start),
          }
        : emptyEntry,
    );
  }

  function closeEditor() {
    setEditingIndex(null);
    setAddingSession(false);
    setNewSession(emptyEntry);
  }

  function updateSession(index: number, next: TimetableAnalysisEntry) {
    onChange(
      entries.map((entry, entryIndex) =>
        entryIndex === index ? next : entry,
      ),
    );
    closeEditor();
  }

  return (
    <section
      className="border-t border-[var(--line)] pt-7"
      aria-labelledby="timetable-review-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">
            Review timetable
          </p>
          <h2
            id="timetable-review-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.03em]"
          >
            Check your normal teaching week.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-ink)]">
            We found {entries.length} teaching session
            {entries.length === 1 ? "" : "s"}. Check the week before
            continuing, nothing is saved yet.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => openNewSession()}
            className="min-h-11 rounded-xl border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]"
          >
            + Add missing session
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
          >
            Confirm timetable
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] hover:border-[var(--accent)]"
          >
            Discard
          </button>
        </div>
      </div>
      {warnings.length ? (
        <ul className="mt-4 space-y-1 border-y border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          {warnings.map((warning) => (
            <li key={warning}>• {warning}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-5">
        <WeeklyCalendar
          timetableEntries={calendarEntries}
          commitments={[]}
          selectedEntryId={
            editingIndex === null ? null : draftEntryId(editingIndex)
          }
          onSelectEntry={(entry) => {
            const index = Number(entry.id.replace("draft-session-", ""));
            if (Number.isInteger(index) && entries[index]) {
              setAddingSession(false);
              setEditingIndex(index);
            }
          }}
          onSelectEmptySlot={openNewSession}
        />
      </div>
      <p className="mt-3 text-sm text-[var(--muted-ink)]">
        Click a class to correct it, or an empty time slot to add a missing
        session.
      </p>
      {editingEntry ? (
        <DraftTeachingSessionDialog
          entry={editingEntry}
          isNew={false}
          onSave={(next) => updateSession(editingIndex!, next)}
          onDelete={() => {
            onChange(entries.filter((_, index) => index !== editingIndex));
            closeEditor();
          }}
          onClose={closeEditor}
        />
      ) : null}
      {addingSession ? (
        <DraftTeachingSessionDialog
          entry={newSession}
          isNew
          onSave={(next) => {
            onChange([...entries, next]);
            closeEditor();
          }}
          onClose={closeEditor}
        />
      ) : null}
    </section>
  );
}
