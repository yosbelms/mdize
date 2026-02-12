import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

interface TextStyle {
  fontFamily: string;
  ascent: number;
  descent: number;
  vertical: boolean;
}

interface LinkAnnotation {
  url: string;
  rect: number[]; // [x0, y0, x1, y1] in PDF bottom-origin coords
}

import {
  DocumentConverter,
  type StreamInfo,
  type ConversionResult,
  type ConvertOptions,
} from "../base-converter.js";
import {
  detectTables,
  mergeMasterFormatNumbering,
  type PositionedWord,
} from "./table-detector.js";
import { convertHtmlString } from "./html-converter.js";

const PDF_EXTENSIONS = new Set([".pdf"]);
const PDF_MIMETYPES = new Set(["application/pdf", "application/x-pdf"]);

export class PdfConverter extends DocumentConverter {
  accepts(_input: Buffer, info: StreamInfo): boolean {
    if (info.extension && PDF_EXTENSIONS.has(info.extension)) return true;
    if (info.mimetype && PDF_MIMETYPES.has(info.mimetype)) return true;
    return false;
  }

  async convert(
    input: Buffer,
    _info: StreamInfo,
    options?: ConvertOptions,
  ): Promise<ConversionResult> {
    const data = new Uint8Array(input);
    const doc = await getDocument({ data, useSystemFonts: true }).promise;

    const chunks: string[] = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });

      // Build positioned words from text items
      const words: PositionedWord[] = [];
      for (const item of textContent.items) {
        if (!("str" in item)) continue;
        const textItem = item as TextItem;
        if (!textItem.str.trim()) continue;

        const tx = textItem.transform;
        const x0 = tx[4];
        const top = viewport.height - tx[5];
        const x1 = x0 + textItem.width;

        words.push({ text: textItem.str.trim(), x0, x1, top });
      }

      // Try table detection
      const tableResult = detectTables(words, { pageWidth: viewport.width });

      if (tableResult) {
        chunks.push(tableResult);
      } else {
        const annotations = await extractLinkAnnotations(page, viewport.height);
        const html = buildPageHtml(
          textContent.items as TextItem[],
          (textContent.styles ?? {}) as Record<string, TextStyle>,
          annotations,
          viewport.height,
        );
        const { markdown } = convertHtmlString(html, options);
        chunks.push(markdown);
      }
    }

    await doc.destroy();

    let markdown = chunks.join("\n\n");

    // Post-process: merge MasterFormat partial numbering
    markdown = mergeMasterFormatNumbering(markdown);

    // Normalize whitespace
    markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();

    return { markdown };
  }
}

async function extractLinkAnnotations(
  page: any,
  _viewportHeight: number,
): Promise<LinkAnnotation[]> {
  try {
    const annots = await page.getAnnotations();
    const links: LinkAnnotation[] = [];
    for (const a of annots) {
      if (a.subtype === "Link" && a.url && a.rect) {
        links.push({ url: a.url, rect: a.rect });
      }
    }
    return links;
  } catch {
    return [];
  }
}

interface EnrichedItem {
  str: string;
  x0: number;
  top: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  linkUrl: string | null;
}

interface LineInfo {
  text: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  indent: number;
  top: number;
  linkUrl: string | null;
  items: EnrichedItem[];
}

type LineType = "heading" | "bullet" | "ordered" | "paragraph";

interface ClassifiedLine {
  type: LineType;
  headingLevel?: number;
  text: string;
  bold: boolean;
  italic: boolean;
  linkUrl: string | null;
  items: EnrichedItem[];
}

function buildPageHtml(
  items: TextItem[],
  styles: Record<string, TextStyle>,
  annotations: LinkAnnotation[],
  viewportHeight: number,
): string {
  // Phase A — Enrich items
  const enriched: EnrichedItem[] = [];
  for (const item of items) {
    if (!("str" in item) || !item.str.trim()) continue;

    const tx = item.transform;
    let fontSize = Math.abs(tx[0]);
    if (fontSize === 0) fontSize = Math.abs(tx[3]);
    if (fontSize === 0) fontSize = 12;

    const style = item.fontName ? styles[item.fontName] : undefined;
    const fontFamily = style?.fontFamily ?? "";
    const bold = /Bold|Black|Heavy/i.test(fontFamily);
    const italic = /Italic|Oblique/i.test(fontFamily);

    const x0 = tx[4];
    const top = viewportHeight - tx[5];

    // Check if item center falls within any link annotation rect
    const cx = x0 + item.width / 2;
    const cy = tx[5]; // PDF bottom-origin Y for matching against annotation rect
    let linkUrl: string | null = null;
    for (const ann of annotations) {
      const [ax0, ay0, ax1, ay1] = ann.rect;
      if (cx >= ax0 && cx <= ax1 && cy >= ay0 && cy <= ay1) {
        linkUrl = ann.url;
        break;
      }
    }

    enriched.push({
      str: item.str,
      x0,
      top,
      fontSize,
      bold,
      italic,
      linkUrl,
    });
  }

  if (enriched.length === 0) return "";

  // Phase B — Group into lines (same Y-tolerance as existing code: 5px)
  const lines: LineInfo[] = [];
  let currentItems: EnrichedItem[] = [enriched[0]];

  for (let i = 1; i < enriched.length; i++) {
    const item = enriched[i];
    const prevItem = enriched[i - 1];
    if (Math.abs(item.top - prevItem.top) > 5) {
      lines.push(buildLine(currentItems));
      currentItems = [item];
    } else {
      currentItems.push(item);
    }
  }
  lines.push(buildLine(currentItems));

  // Phase C — Determine body font size (most common by character count)
  const fontSizeCounts = new Map<number, number>();
  for (const line of lines) {
    const rounded = Math.round(line.fontSize * 2) / 2; // round to nearest 0.5
    fontSizeCounts.set(
      rounded,
      (fontSizeCounts.get(rounded) ?? 0) + line.text.length,
    );
  }
  let bodySize = 12;
  let maxCount = 0;
  for (const [size, count] of fontSizeCounts) {
    if (count > maxCount) {
      maxCount = count;
      bodySize = size;
    }
  }

  // Phase D — Classify lines
  const classified: ClassifiedLine[] = [];
  for (const line of lines) {
    const roundedSize = Math.round(line.fontSize * 2) / 2;
    const ratio = roundedSize / bodySize;

    let type: LineType = "paragraph";
    let headingLevel: number | undefined;

    if (ratio >= 1.15 && line.text.length <= 120) {
      type = "heading";
      if (ratio >= 1.8) headingLevel = 1;
      else if (ratio >= 1.5) headingLevel = 2;
      else headingLevel = 3;
    } else if (/^[•●○▪■\-*→]\s/.test(line.text)) {
      type = "bullet";
    } else if (/^(\d+[.)]\s|[a-z][.)]\s|\([a-z0-9]+\)\s)/i.test(line.text)) {
      type = "ordered";
    }

    classified.push({
      type,
      headingLevel,
      text: line.text,
      bold: line.bold,
      italic: line.italic,
      linkUrl: line.linkUrl,
      items: line.items,
    });
  }

  // Phase E — Build HTML
  const htmlParts: string[] = [];
  let i = 0;
  while (i < classified.length) {
    const line = classified[i];

    if (line.type === "heading") {
      const tag = `h${line.headingLevel}`;
      htmlParts.push(`<${tag}>${formatInlineHtml(line)}</${tag}>`);
      i++;
    } else if (line.type === "bullet") {
      htmlParts.push("<ul>");
      while (i < classified.length && classified[i].type === "bullet") {
        const bulletText = classified[i].text.replace(/^[•●○▪■\-*→]\s*/, "");
        htmlParts.push(
          `<li>${formatInlineHtmlFromText(bulletText, classified[i])}</li>`,
        );
        i++;
      }
      htmlParts.push("</ul>");
    } else if (line.type === "ordered") {
      htmlParts.push("<ol>");
      while (i < classified.length && classified[i].type === "ordered") {
        const olText = classified[i].text.replace(
          /^(\d+[.)]\s|[a-z][.)]\s|\([a-z0-9]+\)\s)/i,
          "",
        );
        htmlParts.push(
          `<li>${formatInlineHtmlFromText(olText, classified[i])}</li>`,
        );
        i++;
      }
      htmlParts.push("</ol>");
    } else {
      // Paragraph
      htmlParts.push(`<p>${formatInlineHtml(line)}</p>`);
      i++;
    }
  }

  return htmlParts.join("\n");
}

function buildLine(items: EnrichedItem[]): LineInfo {
  // Sort by x0 position
  items.sort((a, b) => a.x0 - b.x0);

  // Concatenate text
  let text = "";
  for (const item of items) {
    if (text && !text.endsWith(" ") && !item.str.startsWith(" ")) {
      text += " ";
    }
    text += item.str;
  }
  text = text.trim();

  // Dominant fontSize: weighted by string length
  let totalChars = 0;
  let weightedSize = 0;
  for (const item of items) {
    const len = item.str.trim().length;
    totalChars += len;
    weightedSize += item.fontSize * len;
  }
  const fontSize = totalChars > 0 ? weightedSize / totalChars : 12;

  // All bold / all italic
  const bold = items.every((it) => it.bold);
  const italic = items.every((it) => it.italic);

  // Link URL: use the first non-null link
  let linkUrl: string | null = null;
  for (const item of items) {
    if (item.linkUrl) {
      linkUrl = item.linkUrl;
      break;
    }
  }

  return {
    text,
    fontSize,
    bold,
    italic,
    indent: items[0].x0,
    top: items[0].top,
    linkUrl,
    items,
  };
}

function formatInlineHtml(line: ClassifiedLine): string {
  return formatInlineHtmlFromText(line.text, line);
}

function formatInlineHtmlFromText(
  text: string,
  line: { bold: boolean; italic: boolean; linkUrl: string | null },
): string {
  let html = escapeHtml(text);
  if (line.bold) html = `<strong>${html}</strong>`;
  if (line.italic) html = `<em>${html}</em>`;
  if (line.linkUrl) html = `<a href="${escapeHtml(line.linkUrl)}">${html}</a>`;
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractPlainText(items: TextItem[]): string {
  const lines: string[] = [];
  let currentLine = "";
  let lastY: number | null = null;

  for (const item of items) {
    if (!("str" in item)) continue;
    const y = item.transform[5];

    if (lastY !== null && Math.abs(y - lastY) > 5) {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = item.str;
    } else {
      if (
        currentLine &&
        !currentLine.endsWith(" ") &&
        !item.str.startsWith(" ")
      ) {
        currentLine += " ";
      }
      currentLine += item.str;
    }
    lastY = y;
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines.join("\n");
}
