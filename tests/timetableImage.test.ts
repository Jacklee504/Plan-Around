import { describe, expect, it } from "vitest";
import { timetableDayPanelBounds, timetableGridRowBounds, timetableGridVerticalLines } from "../lib/timetableImage";

function pixelsWithVerticalLines(width: number, height: number, lines: number[], top = 0, bottom = height) {
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const x of lines) {
    for (let y = top; y < bottom; y += 1) {
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

  it("returns a distinct bound for each weekday panel", () => {
    const panels = timetableDayPanelBounds([10, 24, 46, 68, 90, 112, 134]);

    expect(panels).toHaveLength(5);
    expect(panels.map(({ dayLeft, dayRight }) => dayRight - dayLeft)).toEqual([22, 22, 22, 22, 22]);
  });

  it("trims surrounding page content while retaining the full grid", () => {
    const lines = [10, 24, 46, 68, 90, 112, 134];
    const pixels = pixelsWithVerticalLines(150, 100, lines, 12, 91);

    expect(timetableGridRowBounds(pixels, 150, 100, lines)).toEqual({ top: 12, bottom: 91 });
  });
});
