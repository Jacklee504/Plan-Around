import type { StudyBlock } from "@/types";

export function studyBlockMinutes(block: StudyBlock) {
  const [startHours, startMinutes] = block.start.split(":").map(Number);
  const [endHours, endMinutes] = block.end.split(":").map(Number);
  return endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
}

export function completedStudyBlocks(blocks: StudyBlock[]) {
  return blocks.filter((block) => Boolean(block.completedAt));
}

export function incompleteStudyBlocks(blocks: StudyBlock[]) {
  return blocks.filter((block) => !block.completedAt);
}

export function completedMinutes(blocks: StudyBlock[]) {
  return completedStudyBlocks(blocks).reduce((total, block) => total + studyBlockMinutes(block), 0);
}

export function completedMinutesByTask(blocks: StudyBlock[]) {
  return completedStudyBlocks(blocks).reduce<Record<string, number>>((totals, block) => {
    totals[block.taskId] = (totals[block.taskId] ?? 0) + studyBlockMinutes(block);
    return totals;
  }, {});
}
