import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTimetablePdf } from "../lib/timetableParser";

const repoRoot = join(__dirname, "..");

describe("parseTimetablePdf routing behaviour", () => {
  it("parses the existing uncompressed sample PDF (no vision fallback needed)", () => {
    const pdfContent = readFileSync(join(repoRoot, "public/semester-1-timetable.pdf"), "latin1");
    const result = parseTimetablePdf(pdfContent);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it("throws on a PDF whose content stream is compressed (FlateDecode), which is the trigger for the visual fallback", () => {
    const pdfContent = readFileSync(join(repoRoot, "demo/demo_timetable_visual_grid.pdf"), "latin1");
    expect(pdfContent).toContain("FlateDecode");
    expect(() => parseTimetablePdf(pdfContent)).toThrow("No readable timetable rows were found");
  });
});
