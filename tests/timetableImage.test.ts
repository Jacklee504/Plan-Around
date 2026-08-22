import { describe, expect, it } from "vitest";
import { timetableContactSheetLayout, timetableDayPanelBounds, timetableGridVerticalLines } from "../lib/timetableImage";

function pixelsWithVerticalLines(width: number, height: number, lines: number[]) {
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const x of lines) {
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = 100;
      pixels[offset + 1] = 100;
      pixels[offset + 2] = 100;
    }
  }
  return pixels;
}

describe("timetableGridVerticalLines", () => {
  it("finds the time column plus weekday boundaries in a grid", () => {
    const lines = [10, 24, 46, 68, 90, 112, 134];
    expect(timetableGridVerticalLines(pixelsWithVerticalLines(150, 100, lines), 150, 100)).toEqual(lines);
    expect(timetableDayPanelBounds(lines)).toEqual([
      { dayLeft: 24, dayRight: 46 },
      { dayLeft: 46, dayRight: 68 },
      { dayLeft: 68, dayRight: 90 },
      { dayLeft: 90, dayRight: 112 },
      { dayLeft: 112, dayRight: 134 },
    ]);
  });

  it("falls back when the image does not look like a multi-day grid", () => {
    expect(timetableGridVerticalLines(pixelsWithVerticalLines(100, 100, [10, 40, 80]), 100, 100)).toEqual([]);
  });

  it("puts a five-day timetable into two compact rows so Friday is not at the image edge", () => {
    expect(timetableContactSheetLayout([100, 100, 100, 100, 100], 400)).toEqual({
      width: 324,
      height: 812,
      panels: [
        { left: 0, top: 0 },
        { left: 112, top: 0 },
        { left: 224, top: 0 },
        { left: 0, top: 412 },
        { left: 112, top: 412 },
      ],
    });
  });
});
