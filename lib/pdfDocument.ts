import type { PDFDocumentProxy } from "pdfjs-dist";

// Loaded lazily, never at module scope: pdfjs-dist touches browser-only
// globals (DOMMatrix, etc.) on import, which breaks static-export
// prerendering of these "use client" pages if imported eagerly. This also
// keeps the (fairly large) library out of every page's initial bundle.
let pdfjsModulePromise: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfjs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import("pdfjs-dist").then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return pdfjsLib;
    });
  }
  return pdfjsModulePromise;
}

export const MAX_PDF_UPLOAD_BYTES = 15 * 1024 * 1024;
// Sanity bound on how many pages get a text-extraction pass - well beyond any
// real assignment brief or timetable, mainly to keep a pathological PDF fast.
const MAX_TEXT_EXTRACTION_PAGES = 30;
// Below this many non-whitespace characters, embedded text is treated as
// noise (e.g. a handful of stray glyphs on an otherwise scanned page) rather
// than a usable brief, so the caller falls back to visual analysis instead.
const MIN_USEFUL_TEXT_CHARACTERS = 40;
// Pages beyond this are not rendered for the vision fallback - keeps the
// stitched image (and therefore the request to the hosted analyser) bounded.
const MAX_RENDER_PAGES = 6;
const RENDER_SCALE = 2;

export function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function assertPdfUploadSize(file: File) {
  if (file.size > MAX_PDF_UPLOAD_BYTES) throw new Error("Choose a PDF smaller than 15 MB.");
}

async function withPdfDocument<T>(file: File, run: (pdfDocument: PDFDocumentProxy) => Promise<T>): Promise<T> {
  const pdfjsLib = await loadPdfjs();
  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data });
  try {
    let pdfDocument: PDFDocumentProxy;
    try {
      pdfDocument = await loadingTask.promise;
    } catch {
      throw new Error("This PDF could not be opened. It may be corrupted or password-protected.");
    }
    return await run(pdfDocument);
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Text-layer extraction only - never touches raw bytes beyond what pdf.js
 * needs to read the document locally. Nothing is sent anywhere at this stage.
 */
export async function extractPdfEmbeddedText(file: File): Promise<string> {
  assertPdfUploadSize(file);
  return withPdfDocument(file, async (pdfDocument) => {
    const pageCount = Math.min(pdfDocument.numPages, MAX_TEXT_EXTRACTION_PAGES);
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      pageTexts.push(pageText);
    }
    return pageTexts.join("\n").replace(/[ \t]+/g, " ").trim();
  });
}

export function hasUsefulEmbeddedText(text: string) {
  return text.replace(/\s+/g, "").length >= MIN_USEFUL_TEXT_CHARACTERS;
}

/**
 * Renders up to MAX_RENDER_PAGES pages locally and stitches them into one
 * tall image, returned as a File so it can be handed straight to the
 * existing prepareAnalysisImage()/hosted image-analysis pipeline unchanged -
 * the PDF bytes themselves are never sent anywhere.
 */
export async function renderPdfToImageFile(file: File): Promise<File> {
  assertPdfUploadSize(file);
  return withPdfDocument(file, async (pdfDocument) => {
    const pageCount = Math.min(pdfDocument.numPages, MAX_RENDER_PAGES);
    if (!pageCount) throw new Error("This PDF has no pages to render.");

    const pageCanvases: HTMLCanvasElement[] = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser could not render the PDF.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, viewport }).promise;
      pageCanvases.push(canvas);
    }

    const combinedWidth = Math.max(...pageCanvases.map((canvas) => canvas.width));
    const combinedHeight = pageCanvases.reduce((total, canvas) => total + canvas.height, 0);
    const combinedCanvas = document.createElement("canvas");
    combinedCanvas.width = combinedWidth;
    combinedCanvas.height = combinedHeight;
    const combinedContext = combinedCanvas.getContext("2d");
    if (!combinedContext) throw new Error("This browser could not render the PDF.");
    combinedContext.fillStyle = "#ffffff";
    combinedContext.fillRect(0, 0, combinedWidth, combinedHeight);
    let offsetY = 0;
    for (const canvas of pageCanvases) {
      combinedContext.drawImage(canvas, 0, offsetY);
      offsetY += canvas.height;
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      combinedCanvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("This PDF page could not be rendered as an image."));
      }, "image/jpeg", 0.92);
    });

    const renderedName = `${file.name.replace(/\.pdf$/i, "")}-rendered.jpg`;
    return new File([blob], renderedName, { type: "image/jpeg" });
  });
}
