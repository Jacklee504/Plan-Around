import { describe, expect, it } from "vitest";
import { timetableGridVerticalLines } from "../lib/timetableImage";

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
  });

  it("falls back when the image does not look like a multi-day grid", () => {
    expect(timetableGridVerticalLines(pixelsWithVerticalLines(100, 100, [10, 40, 80]), 100, 100)).toEqual([]);
  });
});
