import { describe, expect, it } from "vitest";
import { findBlocksDueForNotification, NOTIFY_MINUTES_BEFORE } from "../lib/studyNotifications";
import type { StudyBlock } from "../types";

const NOW = new Date(2026, 7, 19, 9, 0, 0);

function block(overrides: Partial<StudyBlock> = {}): StudyBlock {
  return { id: "b1", assignmentId: "a1", date: "2026-08-19", start: "09:10", end: "10:00", taskId: "t1", taskName: "Draft", ...overrides };
}

function minutesAfterNow(minutes: number) {
  const [hours, mins] = ["09", "00"].map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

describe("findBlocksDueForNotification", () => {
  it("includes a block starting within the reminder window", () => {
    const due = block({ start: minutesAfterNow(NOTIFY_MINUTES_BEFORE - 1) });
    expect(findBlocksDueForNotification([due], NOW, new Set())).toEqual([due]);
  });

  it("excludes a block starting further away than the reminder window", () => {
    const farAway = block({ start: minutesAfterNow(NOTIFY_MINUTES_BEFORE + 30) });
    expect(findBlocksDueForNotification([farAway], NOW, new Set())).toEqual([]);
  });

  it("excludes a block that already started", () => {
    const started = block({ start: minutesAfterNow(-10) });
    expect(findBlocksDueForNotification([started], NOW, new Set())).toEqual([]);
  });

  it("excludes a completed block even if within the window", () => {
    const completed = block({ start: minutesAfterNow(5), completedAt: "2026-08-19T08:00:00.000Z" });
    expect(findBlocksDueForNotification([completed], NOW, new Set())).toEqual([]);
  });

  it("excludes a block already recorded as notified", () => {
    const due = block({ id: "b2", start: minutesAfterNow(5) });
    expect(findBlocksDueForNotification([due], NOW, new Set(["b2"]))).toEqual([]);
  });
});
