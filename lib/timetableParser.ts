import type { TimetableEntry, TimetableSessionType } from "@/types";

const dayIndexes: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const timetableRow = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+([A-Za-z]{2,}\d{3,4})\s+(.+?)\s+(Lecture|Lab|Tutorial)$/i;

type ParsedTimetable = {
  entries: Omit<TimetableEntry, "id" | "attendance">[];
  moduleCount: number;
};

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\([0-7]{1,3})/g, (_, octalValue: string) => String.fromCharCode(Number.parseInt(octalValue, 8)));
}

export function extractPdfText(pdfContent: string) {
  const textSegments = [...pdfContent.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)\s*Tj/g)].map((match) => decodePdfLiteral(match[1]));
  return textSegments.join("\n");
}

export function parseTimetablePdf(pdfContent: string): ParsedTimetable {
  const extractedText = extractPdfText(pdfContent);
  const entries = extractedText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .map((line) => {
      const match = line.match(timetableRow);
      if (!match) return null;

      const [, day, start, end, moduleCode, moduleName, sessionType] = match;
      return {
        moduleCode: moduleCode.toUpperCase(),
        moduleName: moduleName.trim(),
        dayOfWeek: dayIndexes[day.toLowerCase()],
        start,
        end,
        sessionType: sessionType.toLowerCase() as TimetableSessionType,
      };
    })
    .filter((entry): entry is Omit<TimetableEntry, "id" | "attendance"> => entry !== null);

  if (!entries.length) {
    throw new Error("No readable timetable rows were found. Choose a text-based PDF with weekday, time, module and session details.");
  }

  return {
    entries,
    moduleCount: new Set(entries.map((entry) => entry.moduleCode)).size,
  };
}
