import {
  MAX_IMAGE_UPLOAD_BYTES,
  prepareAnalysisImage,
  type PreparedAnalysisImage,
} from "./analysisImage";
import { timetableWeekdays, type TimetableAnalysisEntry } from "./timetableAnalysis";

const MAX_GRID_DAY_COLUMNS = 7;
const MIN_GRID_DAY_COLUMNS = 2;
const MIN_VERTICAL_LINE_RATIO = 0.45;
const DARK_PIXEL_SUM_THRESHOLD = 600;
const PANEL_GAP = 12;
// Seven panels at this limit remain under the Worker's 4.2 MB JSON body limit
// after base64 encoding, while a normal digital timetable panel stays PNG.
const WEEKDAY_PANEL_TARGET_BYTES = 400_000;
export type TimetableSlot = Pick<TimetableAnalysisEntry, "day" | "start" | "end">;
export type PreparedTimetableImage = PreparedAnalysisImage & { slots?: TimetableSlot[] };

function isDarkPixel(pixels: Uint8ClampedArray, offset: number) {
  return pixels[offset] + pixels[offset + 1] + pixels[offset + 2] < DARK_PIXEL_SUM_THRESHOLD;
}

/**
 * Finds the long vertical borders of a timetable grid. This stays deliberately
 * conservative: an unrecognised layout simply uses the existing whole-image
 * analysis path rather than producing misleading crops.
 */
export function timetableGridVerticalLines(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const minimumDarkPixels = Math.ceil(height * MIN_VERTICAL_LINE_RATIO);
  const candidates: number[] = [];

  for (let x = 0; x < width; x += 1) {
    let darkPixels = 0;
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4;
      if (isDarkPixel(pixels, offset)) {
        darkPixels += 1;
      }
    }
    if (darkPixels >= minimumDarkPixels) candidates.push(x);
  }

  const lines: number[] = [];
  for (let index = 0; index < candidates.length;) {
    const first = candidates[index];
    let last = first;
    index += 1;
    while (index < candidates.length && candidates[index] <= last + 1) {
      last = candidates[index];
      index += 1;
    }
    lines.push(Math.round((first + last) / 2));
  }

  const dayColumns = lines.length - 2;
  if (dayColumns < MIN_GRID_DAY_COLUMNS || dayColumns > MAX_GRID_DAY_COLUMNS) return [];

  // Some exported tables omit the final vertical border below the day header.
  // When the remaining weekday columns are consistently sized, recover that
  // boundary instead of silently dropping the final day (usually Friday).
  const widths = lines.slice(2).map((line, index) => line - lines[index + 1]);
  const sortedWidths = [...widths].sort((a, b) => a - b);
  const medianWidth = sortedWidths[Math.floor(sortedWidths.length / 2)];
  const lastWidth = widths.at(-1);
  const inferredRight = lines.at(-1)! + medianWidth;
  if (
    dayColumns < MAX_GRID_DAY_COLUMNS &&
    lastWidth !== undefined &&
    medianWidth > 0 &&
    Math.abs(lastWidth - medianWidth) <= Math.max(4, medianWidth * 0.08) &&
    inferredRight < width - 2
  ) {
    return [...lines, inferredRight];
  }
  return lines;
}

export function timetableDayPanelBounds(verticalLines: number[]) {
  return verticalLines.slice(1, -1).map((dayLeft, index) => ({
    dayLeft,
    dayRight: verticalLines[index + 2],
  }));
}

/**
 * Finds the top and bottom of the grid from its vertical borders. Keeping the
 * crop to the grid gives the model more useful pixels for session text and
 * block boundaries, instead of page titles, notes, or surrounding whitespace.
 */
export function timetableGridRowBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  verticalLines: number[],
) {
  const requiredDarkLines = Math.max(2, Math.ceil(verticalLines.length * 0.75));
  let top = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    let darkLines = 0;
    for (const x of verticalLines) {
      const offset = (y * width + x) * 4;
      if (isDarkPixel(pixels, offset)) darkLines += 1;
    }
    if (darkLines < requiredDarkLines) continue;
    if (top === -1) top = y;
    bottom = y + 1;
  }

  return top >= 0 && bottom > top ? { top, bottom } : null;
}

function gridLinesInTimeColumn(pixels: Uint8ClampedArray, width: number, height: number, left: number, right: number) {
  const rows: number[] = [];
  for (let y = 0; y < height; y += 1) { let count = 0; for (let x = left + 2; x < right - 2; x += 1) { const offset = (y * width + x) * 4; if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] < 720) count += 1; } if (count >= (right - left) * 0.6) rows.push(y); }
  const lines: number[] = [];
  for (let index = 0; index < rows.length;) { const first = rows[index]; let last = first; index += 1; while (index < rows.length && rows[index] <= last + 1) last = rows[index++]; lines.push(Math.round((first + last) / 2)); }
  return lines;
}

function detectedSlots(pixels: Uint8ClampedArray, width: number, verticalLines: number[]) {
  const lines = gridLinesInTimeColumn(pixels, width, Math.floor(pixels.length / (width * 4)), verticalLines[0], verticalLines[1]);
  if (lines.length < 4) return null;
  const rows = lines.slice(1); const step = rows[1] - rows[0];
  if (step < 12 || rows.slice(1).some((row, index) => Math.abs(row - rows[index] - step) > 5)) return null;
  const asTime = (index: number) => { const minutes = 480 + index * 30; return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; };
  return timetableDayPanelBounds(verticalLines).map((panel, dayIndex) => {
    const occupied = rows.slice(0, -1).map((top, index) => { let coloured = 0; let total = 0; for (let y = top + 4; y < rows[index + 1] - 3; y += 3) for (let x = panel.dayLeft + 5; x < panel.dayRight - 5; x += 3) { const offset = (y * width + x) * 4; const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2]; total += 1; if (Math.max(r, g, b) - Math.min(r, g, b) > 12) coloured += 1; } return coloured > total * 0.15; });
    const slots: TimetableSlot[] = []; for (let index = 0; index < occupied.length;) { if (!occupied[index]) { index += 1; continue; } const start = index; while (occupied[index]) index += 1; slots.push({ day: timetableWeekdays[dayIndex], start: asTime(start), end: asTime(index) }); } return slots;
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("This timetable screenshot could not be opened."));
    };
    image.src = objectUrl;
  });
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("This timetable screenshot could not be prepared."));
    }, "image/png");
  });
}

/**
 * Rebuilds a recognisable table grid as individual weekday panels. Every panel
 * repeats the time column beside exactly one day, so the vision model never has
 * to infer which day a block belongs to. Unknown layouts safely use the
 * original image.
 */
export async function prepareTimetableAnalysisImages(file: File): Promise<PreparedTimetableImage[]> {
  if (!file.type.match(/^image\/(?:jpeg|png|webp)$/)) {
    throw new Error("Choose a PNG, JPEG or WebP screenshot.");
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) throw new Error("Choose a screenshot smaller than 8 MB.");

  const image = await loadImage(file);
  const source = document.createElement("canvas");
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) throw new Error("This browser could not prepare the timetable screenshot.");
  sourceContext.drawImage(image, 0, 0);

  const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
  const verticalLines = timetableGridVerticalLines(
    pixels,
    source.width,
    source.height,
  );
  if (!verticalLines.length) return [await prepareAnalysisImage(file)];

  const [tableLeft, timeColumnRight] = verticalLines;
  const timeColumnWidth = timeColumnRight - tableLeft;
  const rowBounds = timetableGridRowBounds(pixels, source.width, source.height, verticalLines);
  const sourceTop = rowBounds?.top ?? 0;
  const sourceHeight = rowBounds ? rowBounds.bottom - rowBounds.top : source.height;
  const dayPanels = timetableDayPanelBounds(verticalLines);
  const slotsByDay = detectedSlots(pixels, source.width, verticalLines);
  return Promise.all(dayPanels.map(async (panel, panelIndex) => {
    const dayWidth = panel.dayRight - panel.dayLeft;
    const weekdayPanel = document.createElement("canvas");
    weekdayPanel.width = timeColumnWidth + PANEL_GAP + dayWidth;
    weekdayPanel.height = sourceHeight;
    const context = weekdayPanel.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the timetable screenshot.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, weekdayPanel.width, weekdayPanel.height);
    context.drawImage(source, tableLeft, sourceTop, timeColumnWidth, sourceHeight, 0, 0, timeColumnWidth, sourceHeight);
    context.drawImage(source, panel.dayLeft, sourceTop, dayWidth, sourceHeight, timeColumnWidth + PANEL_GAP, 0, dayWidth, sourceHeight);

    const weekdayPanelFile = new File(
      [await canvasBlob(weekdayPanel)],
      `${file.name.replace(/\.[^.]+$/, "")}-weekday-panel-${panelIndex + 1}.png`,
      { type: "image/png" },
    );
    return { ...(await prepareAnalysisImage(weekdayPanelFile, { targetBytes: WEEKDAY_PANEL_TARGET_BYTES })), ...(slotsByDay?.[panelIndex]?.length ? { slots: slotsByDay[panelIndex] } : {}) };
  }));
}
