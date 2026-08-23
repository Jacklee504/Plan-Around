import { describe, expect, it } from "vitest";
import {
  timetableDayPanelBounds,
  timetableGridRowBounds,
  timetableGridVerticalLines,
  timetableSlotsFromGrid,
} from "../lib/timetableImage";

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

function pixelsWithGrid(width: number, height: number, verticalLines: number[], rows: number[]) {
  const pixels = pixelsWithVerticalLines(width, height, verticalLines);
  for (const y of rows) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = 100;
      pixels[offset + 1] = 100;
      pixels[offset + 2] = 100;
    }
  }
  return pixels;
}

function fillGridCell(
  pixels: Uint8ClampedArray,
  width: number,
  verticalLines: number[],
  rows: number[],
  day: number,
  hour: number,
  colour: [number, number, number],
) {
  const left = verticalLines[day + 1] + 5;
  const right = verticalLines[day + 2] - 5;
  for (let y = rows[hour] + 4; y < rows[hour + 1] - 3; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * width + x) * 4;
      [pixels[offset], pixels[offset + 1], pixels[offset + 2]] = colour;
    }
  }
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

  it("recovers a missing final weekday border from equal column widths", () => {
    const lines = [10, 24, 46, 68, 90, 112];
    expect(timetableGridVerticalLines(pixelsWithVerticalLines(150, 100, lines), 150, 100)).toEqual([
      10, 24, 46, 68, 90, 112, 134,
    ]);
  });

  it("does not infer a weekday after a complete table with trailing whitespace", () => {
    const lines = [10, 24, 46, 68, 90, 112, 134];
    expect(timetableGridVerticalLines(pixelsWithVerticalLines(200, 100, lines), 200, 100)).toEqual(lines);
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

  it("uses regular grid rows and colour changes to keep adjacent lessons separate", () => {
    const verticalLines = [10, 24, 52, 80];
    const rows = [20, 40, 60, 80, 100, 120];
    const pixels = pixelsWithGrid(100, 140, verticalLines, rows);
    // Noise above the table used to make the detector abandon the grid.
    for (const y of [2, 5, 9]) {
      for (let x = 10; x < 24; x += 1) {
        const offset = (y * 100 + x) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 100;
      }
    }
    fillGridCell(pixels, 100, verticalLines, rows, 0, 1, [219, 231, 251]);
    fillGridCell(pixels, 100, verticalLines, rows, 0, 2, [230, 244, 232]);
    fillGridCell(pixels, 100, verticalLines, rows, 1, 1, [253, 235, 217]);
    fillGridCell(pixels, 100, verticalLines, rows, 1, 2, [255, 237, 218]);

    expect(timetableSlotsFromGrid(pixels, 100, verticalLines)).toEqual([
      [
        { day: "Monday", start: "09:00", end: "10:00" },
        { day: "Monday", start: "10:00", end: "11:00" },
      ],
      [{ day: "Tuesday", start: "09:00", end: "11:00" }],
    ]);
  });
});
