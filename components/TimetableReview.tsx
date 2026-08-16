"use client";

import type { TimetableAnalysisEntry, TimetableAnalysisSessionType, TimetableWeekday } from "@/lib/timetableAnalysis";

const weekdays: TimetableWeekday[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const inputClassName = "mt-1 min-h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

type TimetableReviewProps = {
  entries: TimetableAnalysisEntry[];
  warnings: string[];
  error?: string;
  onChange: (entries: TimetableAnalysisEntry[]) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

const emptyEntry: TimetableAnalysisEntry = { moduleCode: null, moduleName: "", day: "Monday", start: "09:00", end: "10:00", sessionType: "other" };

export function TimetableReview({ entries, warnings, error, onChange, onConfirm, onCancel }: TimetableReviewProps) {
  function update(index: number, changes: Partial<TimetableAnalysisEntry>) {
    onChange(entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...changes } : entry));
  }

  return (
    <section className="border-t border-[var(--line)] pt-7" aria-labelledby="timetable-review-heading">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Review before saving</p>
      <h2 id="timetable-review-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Check the recurring sessions.</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-ink)]">Nothing is added to your week until you confirm this review. Add missing sessions or correct any uncertain text.</p>
      {warnings.length ? <ul className="mt-4 space-y-1 border-y border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul> : null}
      <div className="mt-5 space-y-4">
        {entries.map((entry, index) => (
          <fieldset key={`${entry.moduleCode ?? "new"}-${index}`} className="grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="sr-only">Teaching session {index + 1}</legend>
            <label className="text-sm font-medium">Module code<input value={entry.moduleCode ?? ""} onChange={(event) => update(index, { moduleCode: event.target.value || null })} className={inputClassName} placeholder="CS301" /></label>
            <label className="text-sm font-medium sm:col-span-1 lg:col-span-2">Module name<input value={entry.moduleName ?? ""} onChange={(event) => update(index, { moduleName: event.target.value || null })} className={inputClassName} placeholder="Software Engineering" /></label>
            <label className="text-sm font-medium">Day<select value={entry.day} onChange={(event) => update(index, { day: event.target.value as TimetableWeekday })} className={inputClassName}>{weekdays.map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
            <label className="text-sm font-medium">Start<input value={entry.start} onChange={(event) => update(index, { start: event.target.value })} className={inputClassName} type="time" /></label>
            <label className="text-sm font-medium">End<input value={entry.end} onChange={(event) => update(index, { end: event.target.value })} className={inputClassName} type="time" /></label>
            <label className="text-sm font-medium">Type<select value={entry.sessionType} onChange={(event) => update(index, { sessionType: event.target.value as TimetableAnalysisSessionType })} className={inputClassName}><option value="lecture">Lecture</option><option value="lab">Lab</option><option value="tutorial">Tutorial</option><option value="other">Class</option></select></label>
            <div className="flex items-end"><button type="button" onClick={() => onChange(entries.filter((_, entryIndex) => entryIndex !== index))} className="min-h-10 text-sm font-semibold text-[var(--muted-ink)] hover:text-red-700">Delete session</button></div>
          </fieldset>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => onChange([...entries, { ...emptyEntry }])} className="min-h-11 rounded-xl border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]">Add missing session</button>
        <button type="button" onClick={onConfirm} className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">Confirm timetable</button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] hover:border-[var(--accent)]">Discard review</button>
      </div>
      {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
    </section>
  );
}
