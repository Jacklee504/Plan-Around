import {
  MAX_IMAGE_UPLOAD_BYTES,
  prepareAnalysisImage,
  type PreparedAnalysisImage,
} from "./analysisImage";

const MAX_GRID_DAY_COLUMNS = 7;
const MIN_GRID_DAY_COLUMNS = 2;
const MIN_VERTICAL_LINE_RATIO = 0.45;
const DARK_PIXEL_SUM_THRESHOLD = 600;
const PANEL_GAP = 12;
const CONTACT_SHEET_COLUMNS = 3;

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
      if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] < DARK_PIXEL_SUM_THRESHOLD) {
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
  return dayColumns >= MIN_GRID_DAY_COLUMNS && dayColumns <= MAX_GRID_DAY_COLUMNS
    ? lines
    : [];
}

export function timetableDayPanelBounds(verticalLines: number[]) {
  return verticalLines.slice(1, -1).map((dayLeft, index) => ({
    dayLeft,
    dayRight: verticalLines[index + 2],
  }));
}

export function timetableDayPanelGroups<T>(panels: T[]) {
  return Array.from(
    { length: Math.ceil(panels.length / CONTACT_SHEET_COLUMNS) },
    (_, index) => panels.slice(index * CONTACT_SHEET_COLUMNS, (index + 1) * CONTACT_SHEET_COLUMNS),
  );
}

type ContactSheetPanel = {
  left: number;
  top: number;
};

/**
 * Places weekday panels in a compact reading-order grid. A wide single row
 * makes the last weekday susceptible to provider-side image downscaling or
 * cropping; three columns keep every weekday in the useful central area.
 */
export function timetableContactSheetLayout(panelWidths: number[], panelHeight: number) {
  const rows = Math.ceil(panelWidths.length / CONTACT_SHEET_COLUMNS);
  const rowWidths = Array.from({ length: rows }, (_, row) => {
    const first = row * CONTACT_SHEET_COLUMNS;
    const count = Math.min(CONTACT_SHEET_COLUMNS, panelWidths.length - first);
    return panelWidths.slice(first, first + count).reduce((total, width) => total + width, 0) + Math.max(0, count - 1) * PANEL_GAP;
  });
  const panels: ContactSheetPanel[] = [];

  for (let index = 0; index < panelWidths.length; index += 1) {
    const row = Math.floor(index / CONTACT_SHEET_COLUMNS);
    const firstInRow = row * CONTACT_SHEET_COLUMNS;
    const left = panelWidths.slice(firstInRow, index).reduce((total, width) => total + width, 0) + (index - firstInRow) * PANEL_GAP;
    panels.push({ left, top: row * (panelHeight + PANEL_GAP) });
  }

  return {
    width: Math.max(...rowWidths),
    height: rows * panelHeight + Math.max(0, rows - 1) * PANEL_GAP,
    panels,
  };
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
    }, "image/jpeg", 0.9);
  });
}

/**
 * Rebuilds a recognisable table grid as small contact sheets of day panels.
 * Every panel repeats the time column beside exactly one day. Keeping at most
 * three weekday panels per provider image avoids vision-model tile limits that
 * can silently omit later weekdays. Unknown layouts safely use the original.
 */
export async function prepareTimetableAnalysisImages(file: File): Promise<PreparedAnalysisImage[]> {
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

  const verticalLines = timetableGridVerticalLines(
    sourceContext.getImageData(0, 0, source.width, source.height).data,
    source.width,
    source.height,
  );
  if (!verticalLines.length) return [await prepareAnalysisImage(file)];

  const [tableLeft, timeColumnRight] = verticalLines;
  const timeColumnWidth = timeColumnRight - tableLeft;
  const dayPanels = timetableDayPanelBounds(verticalLines);
  return Promise.all(timetableDayPanelGroups(dayPanels).map(async (panels, groupIndex) => {
    const panelWidths = panels.map(
      (panel) => timeColumnWidth + PANEL_GAP + panel.dayRight - panel.dayLeft,
    );
    const layout = timetableContactSheetLayout(panelWidths, source.height);
    const contactSheet = document.createElement("canvas");
    contactSheet.width = layout.width;
    contactSheet.height = layout.height;
    const context = contactSheet.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the timetable screenshot.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, contactSheet.width, contactSheet.height);

    for (const [index, panel] of panels.entries()) {
      const destination = layout.panels[index];
      const dayWidth = panel.dayRight - panel.dayLeft;
      context.drawImage(source, tableLeft, 0, timeColumnWidth, source.height, destination.left, destination.top, timeColumnWidth, source.height);
      context.drawImage(source, panel.dayLeft, 0, dayWidth, source.height, destination.left + timeColumnWidth + PANEL_GAP, destination.top, dayWidth, source.height);
    }

    const contactSheetFile = new File(
      [await canvasBlob(contactSheet)],
      `${file.name.replace(/\.[^.]+$/, "")}-weekday-panels-${groupIndex + 1}.jpg`,
      { type: "image/jpeg" },
    );
    return prepareAnalysisImage(contactSheetFile);
  }));
}
