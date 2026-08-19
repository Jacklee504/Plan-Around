import { describe, expect, it } from "vitest";
import { MAX_PDF_UPLOAD_BYTES, hasUsefulEmbeddedText, isPdfFile } from "../lib/pdfDocument";

function makeFile(name: string, type: string, size = 10) {
  return new File([new Uint8Array(size)], name, { type });
}

describe("isPdfFile", () => {
  it("recognises the application/pdf mime type", () => {
    expect(isPdfFile(makeFile("brief.pdf", "application/pdf"))).toBe(true);
  });

  it("recognises a .pdf extension even with a missing/generic mime type", () => {
    expect(isPdfFile(makeFile("brief.PDF", ""))).toBe(true);
    expect(isPdfFile(makeFile("brief.pdf", "application/octet-stream"))).toBe(true);
  });

  it("does not treat images as PDFs", () => {
    expect(isPdfFile(makeFile("timetable.png", "image/png"))).toBe(false);
    expect(isPdfFile(makeFile("timetable.jpg", "image/jpeg"))).toBe(false);
  });
});

describe("hasUsefulEmbeddedText", () => {
  it("rejects empty or whitespace-only extraction", () => {
    expect(hasUsefulEmbeddedText("")).toBe(false);
    expect(hasUsefulEmbeddedText("   \n\n\t  ")).toBe(false);
  });

  it("rejects a handful of stray characters typical of a scanned page's noise", () => {
    expect(hasUsefulEmbeddedText("- 1 -")).toBe(false);
  });

  it("accepts real assignment-brief-length text", () => {
    expect(hasUsefulEmbeddedText("CS401 Advanced Software Engineering coursework, deadline 9 October 2026, weighting 35%.")).toBe(true);
  });

  it("is a routing decision at an exact character boundary", () => {
    expect(hasUsefulEmbeddedText("a".repeat(39))).toBe(false);
    expect(hasUsefulEmbeddedText("a".repeat(40))).toBe(true);
  });

  it("counts only non-whitespace characters toward the threshold", () => {
    const paddedButSparse = `${"a".repeat(10)}${" ".repeat(200)}`;
    expect(hasUsefulEmbeddedText(paddedButSparse)).toBe(false);
  });
});

describe("MAX_PDF_UPLOAD_BYTES", () => {
  it("is larger than the 8 MB image cap to allow for multi-page documents", () => {
    expect(MAX_PDF_UPLOAD_BYTES).toBeGreaterThan(8 * 1024 * 1024);
  });
});
