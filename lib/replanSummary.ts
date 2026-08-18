import { studyBlockMinutes } from "./studyProgress";
import type { StudyBlock } from "@/types";

export type ReplanSummary = {
  previousIncompleteBlocks: number;
  newIncompleteBlocks: number;
  removedBlocks: number;
  addedBlocks: number;
  unchangedBlocks: number;
  rescheduledMinutes: number;
};

/**
 * Block ids can change with placement, so blocks are matched by what they
 * actually represent rather than by id.
 */
function semanticKey(block: StudyBlock) {
  return `${block.taskId}|${block.date}|${block.start}|${block.end}`;
}

/**
 * Compares an assignment's incomplete StudyBlocks before and after a
 * replan. Completed blocks are history, not something that was replanned,
 * so both sides are filtered to incomplete work before comparing.
 */
export function summarizeReplan(previousBlocks: StudyBlock[], newBlocks: StudyBlock[]): ReplanSummary {
  const previousIncomplete = previousBlocks.filter((block) => !block.completedAt);
  const newIncomplete = newBlocks.filter((block) => !block.completedAt);
  const previousKeys = new Set(previousIncomplete.map(semanticKey));
  const newKeys = new Set(newIncomplete.map(semanticKey));

  const removed = previousIncomplete.filter((block) => !newKeys.has(semanticKey(block)));
  const added = newIncomplete.filter((block) => !previousKeys.has(semanticKey(block)));
  const removedMinutes = removed.reduce((total, block) => total + studyBlockMinutes(block), 0);
  const addedMinutes = added.reduce((total, block) => total + studyBlockMinutes(block), 0);

  return {
    previousIncompleteBlocks: previousIncomplete.length,
    newIncompleteBlocks: newIncomplete.length,
    removedBlocks: removed.length,
    addedBlocks: added.length,
    unchangedBlocks: previousIncomplete.length - removed.length,
    // The conservative, explainable reading: only the smaller side can
    // represent genuine movement rather than a pure addition or removal.
    rescheduledMinutes: Math.min(removedMinutes, addedMinutes),
  };
}
