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
 * Rebuilds a recognisable table grid as one contact sheet of day panels. Every
 * panel repeats the time column beside exactly one day, making grid geometry
 * easier for the vision model to read without relying on it to retain all of
 * several separate image inputs. Unknown layouts safely use the original.
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
  const contactSheet = document.createElement("canvas");
  contactSheet.width = dayPanels.reduce(
    (width, panel) => width + timeColumnWidth + PANEL_GAP + panel.dayRight - panel.dayLeft,
    0,
  );
  contactSheet.height = source.height;
  const context = contactSheet.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the timetable screenshot.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, contactSheet.width, contactSheet.height);

  let panelOffset = 0;
  for (const panel of dayPanels) {
    const dayWidth = panel.dayRight - panel.dayLeft;
    context.drawImage(source, tableLeft, 0, timeColumnWidth, source.height, panelOffset, 0, timeColumnWidth, contactSheet.height);
    context.drawImage(source, panel.dayLeft, 0, dayWidth, source.height, panelOffset + timeColumnWidth + PANEL_GAP, 0, dayWidth, contactSheet.height);
    panelOffset += timeColumnWidth + PANEL_GAP + dayWidth;
  }

  const contactSheetFile = new File(
    [await canvasBlob(contactSheet)],
    `${file.name.replace(/\.[^.]+$/, "")}-weekday-panels.jpg`,
    { type: "image/jpeg" },
  );
  return [await prepareAnalysisImage(contactSheetFile)];
}
