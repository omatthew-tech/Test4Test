import type { jsPDF } from "jspdf";
import type {
  UsabilityReportDetail,
  UsabilityReportFrame,
  UsabilityReportQuote,
} from "../types";
import { getUsabilityReportFrameBlob } from "./usabilityReports";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 34;
const HEADER_HEIGHT = 62;
const FOOTER_TOP = 752;
const CONTENT_BOTTOM = 730;

const COLORS = {
  orange: [245, 142, 86] as const,
  orangeLight: [255, 244, 234] as const,
  ink: [29, 24, 21] as const,
  inkMedium: [79, 71, 65] as const,
  inkLight: [133, 123, 116] as const,
  line: [216, 208, 200] as const,
  surface: [255, 254, 252] as const,
  surfaceMuted: [246, 242, 238] as const,
};

type PdfDocument = jsPDF;
type PdfColor = readonly [number, number, number];
type ImageFormat = "PNG" | "JPEG" | "WEBP";

interface LoadedImage {
  bytes: Uint8Array;
  format: ImageFormat;
}

interface PdfFonts {
  body: "Inter" | "helvetica";
  heading: "Sora" | "helvetica";
}

export interface PdfGenerationProgress {
  completed: number;
  total: number;
  message: string;
}

export interface GeneratedUsabilityReportPdf {
  blob: Blob;
  filename: string;
  warningCount: number;
}

export interface GenerateUsabilityReportPdfOptions {
  onlineUrl: string;
  signal?: AbortSignal;
  onProgress?: (progress: PdfGenerationProgress) => void;
  assetBaseUrl?: string;
  loadFrameImage?: (
    reportId: string,
    frame: UsabilityReportFrame,
    signal?: AbortSignal,
  ) => Promise<Blob>;
}

function setTextColor(doc: PdfDocument, color: PdfColor) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function setDrawColor(doc: PdfDocument, color: PdfColor) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function setFillColor(doc: PdfDocument, color: PdfColor) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function useBodyFont(doc: PdfDocument, fonts: PdfFonts, bold = false) {
  doc.setFont(fonts.body, bold ? "bold" : "normal", bold ? 700 : 400);
}

function useHeadingFont(doc: PdfDocument, fonts: PdfFonts) {
  doc.setFont(fonts.heading, "bold", 700);
}

function sanitizePdfText(value: string) {
  return value
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
}

function truncate(value: string, maxLength: number) {
  const normalized = sanitizePdfText(value);
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

export function getUsabilityReportPdfFilename(reportName: string) {
  const slug = reportName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return `test4test-${slug || "usability-report"}.pdf`;
}

function formatTimestamp(timestampMs: number) {
  const totalSeconds = Math.max(0, Math.round(timestampMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatGeneratedDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { primary: "Unknown", secondary: "date" };
  }

  return {
    primary: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date),
    secondary: new Intl.DateTimeFormat("en", { year: "numeric" }).format(date),
  };
}

function imageFormatFromBlob(blob: Blob): ImageFormat {
  const type = blob.type.toLowerCase();

  if (type.includes("png")) {
    return "PNG";
  }

  if (type.includes("jpeg") || type.includes("jpg")) {
    return "JPEG";
  }

  return "WEBP";
}

function resolveAssetUrl(path: string, assetBaseUrl?: string) {
  const base = assetBaseUrl
    ?? (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1");
  return new URL(path, base).toString();
}

async function fetchOptionalImage(
  path: string,
  signal?: AbortSignal,
  assetBaseUrl?: string,
): Promise<LoadedImage | null> {
  try {
    const response = await fetch(resolveAssetUrl(path, assetBaseUrl), { signal });

    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      format: imageFormatFromBlob(blob),
    };
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException("PDF generation aborted.", "AbortError");
    }

    return null;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function registerReportFonts(
  doc: PdfDocument,
  signal?: AbortSignal,
  assetBaseUrl?: string,
): Promise<PdfFonts> {
  try {
    const [interResponse, soraResponse] = await Promise.all([
      fetch(resolveAssetUrl("/fonts/inter/Inter.ttf", assetBaseUrl), { signal }),
      fetch(resolveAssetUrl("/fonts/sora/Sora.ttf", assetBaseUrl), { signal }),
    ]);

    if (!interResponse.ok || !soraResponse.ok) {
      return { body: "helvetica", heading: "helvetica" };
    }

    const [interBuffer, soraBuffer] = await Promise.all([
      interResponse.arrayBuffer(),
      soraResponse.arrayBuffer(),
    ]);

    doc.addFileToVFS("Inter.ttf", arrayBufferToBase64(interBuffer));
    doc.addFont("Inter.ttf", "Inter", "normal", 400, "Identity-H");
    doc.addFont("Inter.ttf", "Inter", "bold", 700, "Identity-H");
    doc.addFileToVFS("Sora.ttf", arrayBufferToBase64(soraBuffer));
    doc.addFont("Sora.ttf", "Sora", "normal", 500, "Identity-H");
    doc.addFont("Sora.ttf", "Sora", "bold", 700, "Identity-H");
    return { body: "Inter", heading: "Sora" };
  } catch (_error) {
    if (signal?.aborted) {
      throw new DOMException("PDF generation aborted.", "AbortError");
    }

    return { body: "helvetica", heading: "helvetica" };
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>,
) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await task(items[index], index);
      }
    },
  );

  await Promise.all(workers);
}

function drawBrand(
  doc: PdfDocument,
  fonts: PdfFonts,
  logo: LoadedImage | null,
  compact = false,
) {
  const logoHeight = compact ? 24 : 32;
  const logoWidth = compact ? 14 : 19;
  const logoY = (HEADER_HEIGHT - logoHeight) / 2;

  if (logo) {
    try {
      doc.addImage(
        logo.bytes,
        logo.format,
        PAGE_MARGIN,
        logoY,
        logoWidth,
        logoHeight,
        "test4test-logo",
        "FAST",
      );
    } catch (_error) {
      // The wordmark remains available if the decorative image cannot be embedded.
    }
  }

  useHeadingFont(doc, fonts);
  doc.setFontSize(compact ? 13 : 15);
  setTextColor(doc, COLORS.ink);
  doc.text("Test4Test", PAGE_MARGIN + logoWidth + 10, compact ? 38 : 39);
}

function drawBodyHeader(
  doc: PdfDocument,
  report: UsabilityReportDetail,
  fonts: PdfFonts,
  logo: LoadedImage | null,
) {
  setFillColor(doc, COLORS.surface);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  drawBrand(doc, fonts, logo, true);
  useBodyFont(doc, fonts, true);
  doc.setFontSize(9);
  setTextColor(doc, COLORS.inkLight);
  doc.text(
    `${truncate(report.submissionProductName, 42)} - Screenshots & feedback`,
    PAGE_WIDTH - PAGE_MARGIN,
    36,
    { align: "right" },
  );
  setDrawColor(doc, COLORS.line);
  doc.setLineWidth(0.7);
  doc.line(0, HEADER_HEIGHT, PAGE_WIDTH, HEADER_HEIGHT);
}

function drawFooter(
  doc: PdfDocument,
  fonts: PdfFonts,
  pageNumber: number,
  pageCount: number,
  onlineUrl: string,
) {
  setDrawColor(doc, COLORS.line);
  doc.setLineWidth(0.7);
  doc.line(0, FOOTER_TOP, PAGE_WIDTH, FOOTER_TOP);
  useBodyFont(doc, fonts);
  doc.setFontSize(8);
  setTextColor(doc, COLORS.inkLight);
  const footerLabel = "Generated by Test4Test - continues online at";
  doc.text(footerLabel, PAGE_MARGIN, 771);
  setTextColor(doc, COLORS.inkMedium);
  doc.textWithLink("test4test.io", PAGE_MARGIN + doc.getTextWidth(footerLabel) + 4, 771, {
    url: onlineUrl,
  });
  setTextColor(doc, COLORS.inkLight);
  doc.text(`Page ${pageNumber} of ${pageCount}`, PAGE_WIDTH - PAGE_MARGIN, 771, {
    align: "right",
  });
}

function drawCover(
  doc: PdfDocument,
  report: UsabilityReportDetail,
  fonts: PdfFonts,
  logo: LoadedImage | null,
  onlineUrl: string,
  includedQuoteCount: number,
) {
  setFillColor(doc, COLORS.surface);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  drawBrand(doc, fonts, logo);

  const buttonWidth = 96;
  const buttonHeight = 28;
  const buttonX = PAGE_WIDTH - PAGE_MARGIN - buttonWidth;
  const buttonY = 17;
  setFillColor(doc, COLORS.surface);
  setDrawColor(doc, COLORS.line);
  doc.setLineWidth(0.7);
  doc.roundedRect(buttonX, buttonY, buttonWidth, buttonHeight, 14, 14, "FD");
  useBodyFont(doc, fonts, true);
  doc.setFontSize(9);
  setTextColor(doc, COLORS.inkMedium);
  doc.text("View online", buttonX + buttonWidth / 2, buttonY + 18, { align: "center" });
  doc.link(buttonX, buttonY, buttonWidth, buttonHeight, { url: onlineUrl });
  setDrawColor(doc, COLORS.line);
  doc.line(0, HEADER_HEIGHT, PAGE_WIDTH, HEADER_HEIGHT);

  let y = 112;
  useHeadingFont(doc, fonts);
  doc.setFontSize(28);
  setTextColor(doc, COLORS.ink);
  const title = sanitizePdfText(report.reportName || `Report ${report.reportNumber}`);
  const titleLines = doc.splitTextToSize(title, PAGE_WIDTH - PAGE_MARGIN * 2) as string[];
  doc.text(titleLines.slice(0, 3), PAGE_MARGIN, y, { lineHeightFactor: 1.08 });
  y += Math.min(3, titleLines.length) * 31;

  useBodyFont(doc, fonts, true);
  doc.setFontSize(11);
  setTextColor(doc, COLORS.inkLight);
  doc.text(sanitizePdfText(report.submissionProductName), PAGE_MARGIN, y + 5);

  y += 44;
  useHeadingFont(doc, fonts);
  doc.setFontSize(14);
  setTextColor(doc, COLORS.ink);
  doc.text("Summary", PAGE_MARGIN, y);

  const summary = sanitizePdfText(
    report.quoteAnalysis?.analysis?.summary
      || "No AI summary was generated for this report.",
  );
  useBodyFont(doc, fonts);
  doc.setFontSize(10.5);
  setTextColor(doc, COLORS.inkMedium);
  const summaryLines = doc.splitTextToSize(summary, PAGE_WIDTH - PAGE_MARGIN * 2) as string[];
  const summaryY = y + 22;
  const maxCoverLines = Math.max(5, Math.floor((582 - summaryY) / 14));
  const coverLines = summaryLines.slice(0, maxCoverLines);
  doc.text(coverLines, PAGE_MARGIN, summaryY, { lineHeightFactor: 1.34 });

  if (summaryLines.length > maxCoverLines) {
    useBodyFont(doc, fonts, true);
    doc.setFontSize(8.5);
    setTextColor(doc, COLORS.orange);
    doc.text("Summary continues on the next page.", PAGE_MARGIN, 590);
  }

  const statsY = 615;
  const statsWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const cellWidth = statsWidth / 4;
  const statsHeight = 82;
  const generated = formatGeneratedDate(report.completedAt ?? report.createdAt);
  const stats = [
    { label: "RECORDINGS", primary: String(report.sourceResponseCount), secondary: "analyzed" },
    { label: "SCREENSHOTS", primary: String(report.frames.length), secondary: "reviewed" },
    { label: "FEEDBACK NOTES", primary: String(includedQuoteCount), secondary: "included" },
    { label: "GENERATED", primary: generated.primary, secondary: generated.secondary },
  ];

  setFillColor(doc, COLORS.surface);
  setDrawColor(doc, COLORS.line);
  doc.roundedRect(PAGE_MARGIN, statsY, statsWidth, statsHeight, 12, 12, "FD");
  stats.forEach((stat, index) => {
    const cellX = PAGE_MARGIN + cellWidth * index;

    if (index > 0) {
      doc.line(cellX, statsY, cellX, statsY + statsHeight);
    }

    useBodyFont(doc, fonts, true);
    doc.setFontSize(7.2);
    setTextColor(doc, COLORS.inkLight);
    doc.text(stat.label, cellX + 13, statsY + 20);
    useHeadingFont(doc, fonts);
    doc.setFontSize(16);
    setTextColor(doc, COLORS.ink);
    doc.text(stat.primary, cellX + 13, statsY + 45);
    useBodyFont(doc, fonts, true);
    doc.setFontSize(8.5);
    setTextColor(doc, COLORS.inkMedium);
    doc.text(stat.secondary, cellX + 13, statsY + 64);
  });

  return summaryLines.slice(maxCoverLines);
}

function addTitledBodyPage(
  doc: PdfDocument,
  report: UsabilityReportDetail,
  fonts: PdfFonts,
  logo: LoadedImage | null,
  eyebrow: string,
  title: string,
) {
  doc.addPage("letter", "portrait");
  drawBodyHeader(doc, report, fonts, logo);
  const normalizedEyebrow = sanitizePdfText(eyebrow);

  if (normalizedEyebrow) {
    useBodyFont(doc, fonts, true);
    doc.setFontSize(8.5);
    setTextColor(doc, COLORS.orange);
    doc.text(normalizedEyebrow.toUpperCase(), PAGE_MARGIN, 96);
  }

  useHeadingFont(doc, fonts);
  doc.setFontSize(17);
  setTextColor(doc, COLORS.ink);
  doc.text(sanitizePdfText(title), PAGE_MARGIN, normalizedEyebrow ? 119 : 104);
  return normalizedEyebrow ? 145 : 130;
}

function drawSummaryContinuation(
  doc: PdfDocument,
  report: UsabilityReportDetail,
  fonts: PdfFonts,
  logo: LoadedImage | null,
  lines: string[],
) {
  let remaining = [...lines];

  while (remaining.length > 0) {
    const y = addTitledBodyPage(
      doc,
      report,
      fonts,
      logo,
      "Usability Test Report",
      "Summary continued",
    );
    const linesPerPage = Math.floor((CONTENT_BOTTOM - y) / 15);
    const pageLines = remaining.slice(0, linesPerPage);
    remaining = remaining.slice(linesPerPage);
    useBodyFont(doc, fonts);
    doc.setFontSize(10.5);
    setTextColor(doc, COLORS.inkMedium);
    doc.text(pageLines, PAGE_MARGIN, y, { lineHeightFactor: 1.42 });
  }
}

function fitImage(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
) {
  const safeWidth = sourceWidth > 0 ? sourceWidth : 4;
  const safeHeight = sourceHeight > 0 ? sourceHeight : 3;
  const scale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight);
  return { width: safeWidth * scale, height: safeHeight * scale };
}

function drawScreenshot(
  doc: PdfDocument,
  frame: UsabilityReportFrame,
  image: LoadedImage | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  setFillColor(doc, COLORS.surfaceMuted);
  setDrawColor(doc, COLORS.line);
  doc.setLineWidth(0.8);
  doc.roundedRect(x, y, width, height, 10, 10, "FD");

  if (!image) {
    doc.setLineDashPattern([4, 3], 0);
    doc.roundedRect(x + 8, y + 8, width - 16, height - 16, 7, 7, "S");
    doc.setLineDashPattern([], 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    setTextColor(doc, COLORS.inkLight);
    doc.text("Screenshot unavailable", x + width / 2, y + height / 2, { align: "center" });
    return false;
  }

  const fitted = fitImage(
    frame.width ?? 4,
    frame.height ?? 3,
    width - 16,
    height - 16,
  );

  try {
    doc.addImage(
      image.bytes,
      image.format,
      x + (width - fitted.width) / 2,
      y + (height - fitted.height) / 2,
      fitted.width,
      fitted.height,
      `report-frame-${frame.id}`,
      "MEDIUM",
    );
    return true;
  } catch (_error) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    setTextColor(doc, COLORS.inkLight);
    doc.text("Screenshot unavailable", x + width / 2, y + height / 2, { align: "center" });
    return false;
  }
}

function getQuoteHeight(
  doc: PdfDocument,
  fonts: PdfFonts,
  quote: UsabilityReportQuote,
  width: number,
) {
  useBodyFont(doc, fonts, true);
  doc.setFontSize(9.2);
  const lines = doc.splitTextToSize(sanitizePdfText(quote.text), width - 12) as string[];
  return { lines, height: lines.length * 12 + 23 };
}

function drawQuote(
  doc: PdfDocument,
  fonts: PdfFonts,
  quote: UsabilityReportQuote,
  lines: string[],
  x: number,
  y: number,
  width: number,
) {
  setFillColor(doc, COLORS.orange);
  doc.roundedRect(x, y + 1, 3, Math.max(14, lines.length * 12), 1.5, 1.5, "F");
  useBodyFont(doc, fonts, true);
  doc.setFontSize(9.2);
  setTextColor(doc, COLORS.ink);
  lines.forEach((line, index) => {
    doc.text(line, x + 11, y + 9 + index * 12, { maxWidth: width - 11 });
  });
  useBodyFont(doc, fonts);
  doc.setFontSize(7.7);
  setTextColor(doc, COLORS.inkLight);
  const metaY = y + lines.length * 12 + 9;
  doc.text(
    `${sanitizePdfText(quote.testerLabel || "Tester")} - ${formatTimestamp(quote.timestampMs)}`,
    x + 11,
    metaY,
  );
}

function drawScreenPage(
  doc: PdfDocument,
  report: UsabilityReportDetail,
  frame: UsabilityReportFrame,
  screenNumber: number,
  quotes: UsabilityReportQuote[],
  image: LoadedImage | undefined,
  fonts: PdfFonts,
  logo: LoadedImage | null,
) {
  const y = addTitledBodyPage(
    doc,
    report,
    fonts,
    logo,
    "",
    `Screenshot ${screenNumber}`,
  );
  useBodyFont(doc, fonts);
  doc.setFontSize(8.5);
  setTextColor(doc, COLORS.inkLight);
  doc.text(
    `${sanitizePdfText(frame.testerLabel || "Tester")} - ${formatTimestamp(frame.timestampMs)}`,
    PAGE_MARGIN,
    y,
  );

  const bodyY = y + 18;
  const screenshotWidth = 320;
  const feedbackX = PAGE_MARGIN + screenshotWidth + 22;
  const feedbackWidth = PAGE_WIDTH - PAGE_MARGIN - feedbackX;
  const imageDrawn = drawScreenshot(
    doc,
    frame,
    image,
    PAGE_MARGIN,
    bodyY,
    screenshotWidth,
    360,
  );

  useBodyFont(doc, fonts, true);
  doc.setFontSize(7.5);
  setTextColor(doc, COLORS.inkLight);
  doc.text("FEEDBACK", feedbackX, bodyY + 2);

  if (quotes.length === 0) {
    useBodyFont(doc, fonts);
    doc.setFontSize(9);
    setTextColor(doc, COLORS.inkLight);
    doc.text("No feedback captured for this screen.", feedbackX, bodyY + 25, {
      maxWidth: feedbackWidth,
    });
    return { remainingQuotes: [] as UsabilityReportQuote[], imageDrawn };
  }

  let quoteY = bodyY + 18;
  let drawnCount = 0;

  for (const quote of quotes) {
    const measurement = getQuoteHeight(doc, fonts, quote, feedbackWidth);

    if (quoteY + measurement.height > CONTENT_BOTTOM) {
      break;
    }

    drawQuote(doc, fonts, quote, measurement.lines, feedbackX, quoteY, feedbackWidth);
    quoteY += measurement.height + 9;
    drawnCount += 1;
  }

  return { remainingQuotes: quotes.slice(drawnCount), imageDrawn };
}

function drawFullWidthQuotes(
  doc: PdfDocument,
  report: UsabilityReportDetail,
  quotes: UsabilityReportQuote[],
  fonts: PdfFonts,
  logo: LoadedImage | null,
  eyebrow: string,
  title: string,
) {
  let quoteIndex = 0;

  while (quoteIndex < quotes.length) {
    let y = addTitledBodyPage(doc, report, fonts, logo, eyebrow, title);
    const width = PAGE_WIDTH - PAGE_MARGIN * 2;

    while (quoteIndex < quotes.length) {
      const quote = quotes[quoteIndex];
      const { lines } = getQuoteHeight(doc, fonts, quote, width);
      const maxLines = Math.max(1, Math.floor((CONTENT_BOTTOM - y - 24) / 12));
      const pageLines = lines.slice(0, maxLines);

      drawQuote(doc, fonts, quote, pageLines, PAGE_MARGIN, y, width);
      y += pageLines.length * 12 + 32;

      if (pageLines.length < lines.length) {
        const remainingText = lines.slice(pageLines.length).join(" ");
        quotes = [
          ...quotes.slice(0, quoteIndex),
          { ...quote, text: remainingText },
          ...quotes.slice(quoteIndex + 1),
        ];
        break;
      }

      quoteIndex += 1;

      if (quoteIndex < quotes.length && y + 45 > CONTENT_BOTTOM) {
        break;
      }
    }
  }
}

export async function generateUsabilityReportPdf(
  report: UsabilityReportDetail,
  options: GenerateUsabilityReportPdfOptions,
): Promise<GeneratedUsabilityReportPdf> {
  const { jsPDF: JsPdf } = await import("jspdf");
  const doc = new JsPdf({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
    compress: true,
    putOnlyUsedFonts: true,
  });
  const frameImages = new Map<string, LoadedImage>();
  const failedFrameIds = new Set<string>();
  const totalSteps = report.frames.length + 2;
  const loadFrameImage = options.loadFrameImage
    ?? ((reportId: string, frame: UsabilityReportFrame, signal?: AbortSignal) =>
      getUsabilityReportFrameBlob(reportId, frame.id, { signal }));

  options.onProgress?.({
    completed: 0,
    total: totalSteps,
    message: "Loading report design...",
  });

  const [fonts, logo] = await Promise.all([
    registerReportFonts(doc, options.signal, options.assetBaseUrl),
    fetchOptionalImage("/branding/Green%20Logo.png", options.signal, options.assetBaseUrl),
  ]);

  options.onProgress?.({
    completed: 1,
    total: totalSteps,
    message: report.frames.length > 0 ? "Loading report screenshots..." : "Laying out report...",
  });

  let loadedCount = 0;
  await mapWithConcurrency(report.frames, 4, async (frame) => {
    if (options.signal?.aborted) {
      throw new DOMException("PDF generation aborted.", "AbortError");
    }

    try {
      const blob = await loadFrameImage(report.id, frame, options.signal);
      frameImages.set(frame.id, {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        format: imageFormatFromBlob(blob),
      });
    } catch (error) {
      if (options.signal?.aborted) {
        throw new DOMException("PDF generation aborted.", "AbortError");
      }

      failedFrameIds.add(frame.id);
    } finally {
      loadedCount += 1;
      options.onProgress?.({
        completed: loadedCount + 1,
        total: totalSteps,
        message: `Loaded ${loadedCount} of ${report.frames.length} screenshots...`,
      });
    }
  });

  if (options.signal?.aborted) {
    throw new DOMException("PDF generation aborted.", "AbortError");
  }

  options.onProgress?.({
    completed: totalSteps - 1,
    total: totalSteps,
    message: "Laying out your PDF...",
  });

  const includedQuotes = (report.quotes ?? []).filter(
    (quote) => quote.includeInSummary !== false,
  );
  const frameIds = new Set(report.frames.map((frame) => frame.id));
  const quotesByFrame = new Map<string, UsabilityReportQuote[]>();
  const unlinkedQuotes: UsabilityReportQuote[] = [];

  for (const quote of includedQuotes) {
    if (!quote.linkedFrameId || !frameIds.has(quote.linkedFrameId)) {
      unlinkedQuotes.push(quote);
      continue;
    }

    const frameQuotes = quotesByFrame.get(quote.linkedFrameId) ?? [];
    frameQuotes.push(quote);
    quotesByFrame.set(quote.linkedFrameId, frameQuotes);
  }

  const orderedFrames = [...report.frames].sort((first, second) => {
    const responseComparison = first.testResponseId.localeCompare(second.testResponseId);
    return responseComparison
      || first.frameIndex - second.frameIndex
      || first.timestampMs - second.timestampMs;
  });

  doc.setProperties({
    title: sanitizePdfText(report.reportName || `Report ${report.reportNumber}`),
    subject: `Usability Test Report for ${sanitizePdfText(report.submissionProductName)}`,
    author: "Test4Test",
    creator: "Test4Test",
  });

  const summaryRemainder = drawCover(
    doc,
    report,
    fonts,
    logo,
    options.onlineUrl,
    includedQuotes.length,
  );
  drawSummaryContinuation(doc, report, fonts, logo, summaryRemainder);

  orderedFrames.forEach((frame, index) => {
    const frameQuotes = (quotesByFrame.get(frame.id) ?? []).sort(
      (first, second) => first.timestampMs - second.timestampMs,
    );
    const result = drawScreenPage(
      doc,
      report,
      frame,
      index + 1,
      frameQuotes,
      frameImages.get(frame.id),
      fonts,
      logo,
    );

    if (!result.imageDrawn) {
      failedFrameIds.add(frame.id);
    }

    if (result.remainingQuotes.length > 0) {
      drawFullWidthQuotes(
        doc,
        report,
        result.remainingQuotes,
        fonts,
        logo,
        "",
        `Screenshot ${index + 1} - Feedback continued`,
      );
    }
  });

  if (unlinkedQuotes.length > 0) {
    drawFullWidthQuotes(
      doc,
      report,
      unlinkedQuotes.sort((first, second) => first.timestampMs - second.timestampMs),
      fonts,
      logo,
      "Additional feedback",
      "Feedback without a linked screenshot",
    );
  }

  const pageCount = doc.getNumberOfPages();

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    drawFooter(doc, fonts, pageNumber, pageCount, options.onlineUrl);
  }

  const blob = doc.output("blob");
  options.onProgress?.({
    completed: totalSteps,
    total: totalSteps,
    message: "PDF ready.",
  });

  return {
    blob,
    filename: getUsabilityReportPdfFilename(report.reportName || `Report ${report.reportNumber}`),
    warningCount: failedFrameIds.size,
  };
}
