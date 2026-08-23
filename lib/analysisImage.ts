import type { AnalysisImageMimeType, AssignmentAnalysisInput } from "@/lib/assignmentAnalysis";

export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;
export const TARGET_IMAGE_BYTES = 1_500_000;
const MAX_IMAGE_EDGE = 2_000;
const IMAGE_OUTPUT_QUALITIES = [0.84, 0.74, 0.64];
const IMAGE_OUTPUT_EDGES = [MAX_IMAGE_EDGE, 1_800, 1_600];

function supportedImageMimeType(file: File): file is File & { type: AnalysisImageMimeType } {
  return file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp";
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
      reject(new Error("This screenshot could not be opened. Choose a PNG, JPEG or WebP image."));
    };
    image.src = objectUrl;
  });
}

function createCanvas(image: HTMLImageElement, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the screenshot.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("This screenshot could not be prepared."));
    }, "image/jpeg", quality);
  });
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("This screenshot could not be read."));
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        reject(new Error("This screenshot could not be read."));
        return;
      }
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export type PreparedAnalysisImage = Extract<AssignmentAnalysisInput, { kind: "image" }> & {
  filename: string;
  originalSize: number;
  preparedSize: number;
};

type PrepareAnalysisImageOptions = {
  targetBytes?: number;
};

function preparedImage(file: File & { type: AnalysisImageMimeType }, blob: Blob, mimeType: AnalysisImageMimeType): Promise<PreparedAnalysisImage> {
  return blobToBase64(blob).then((base64) => ({
    kind: "image",
    mimeType,
    base64,
    filename: file.name,
    originalSize: file.size,
    preparedSize: blob.size,
  }));
}

/**
 * Validates each screenshot locally. Crisp, already-bounded images keep their
 * original encoding so timetable text is not blurred by an unnecessary JPEG pass.
 */
export async function prepareAnalysisImage(
  file: File,
  { targetBytes = TARGET_IMAGE_BYTES }: PrepareAnalysisImageOptions = {},
): Promise<PreparedAnalysisImage> {
  if (!supportedImageMimeType(file)) throw new Error("Choose a PNG, JPEG or WebP screenshot.");
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) throw new Error("Choose a screenshot smaller than 8 MB.");

  await loadImage(file);
  if (file.size <= targetBytes) return preparedImage(file, file, file.type);

  const image = await loadImage(file);
  let smallestBlob: Blob | null = null;

  for (const maxEdge of IMAGE_OUTPUT_EDGES) {
    const canvas = createCanvas(image, maxEdge);
    for (const quality of IMAGE_OUTPUT_QUALITIES) {
      const blob = await canvasToBlob(canvas, quality);
      if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
      if (blob.size <= targetBytes) return preparedImage(file, blob, "image/jpeg");
    }
  }

  if (!smallestBlob) throw new Error("This screenshot could not be prepared.");
  throw new Error("This screenshot is still too detailed after compression. Crop it to the relevant timetable or brief and try again.");
}
