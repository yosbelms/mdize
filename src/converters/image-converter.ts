import ExifReader from "exif-reader";
import {
  DocumentConverter,
  type StreamInfo,
  type ConversionResult,
  type ConvertOptions,
} from "../base-converter.js";
import {
  detectTables,
  type PositionedWord,
} from "./table-detector.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const IMAGE_MIMETYPES = new Set(["image/jpeg", "image/png"]);

export class ImageConverter extends DocumentConverter {
  accepts(_input: Buffer, info: StreamInfo): boolean {
    if (info.extension && IMAGE_EXTENSIONS.has(info.extension)) return true;
    if (info.mimetype && IMAGE_MIMETYPES.has(info.mimetype)) return true;
    return false;
  }

  async convert(
    input: Buffer,
    info: StreamInfo,
    options?: ConvertOptions,
  ): Promise<ConversionResult> {
    const parts: string[] = [];

    // Extract EXIF metadata
    const metadata = extractExifMetadata(input);
    if (metadata.length > 0) {
      parts.push("## Image Metadata\n");
      for (const [key, value] of metadata) {
        parts.push(`- **${key}:** ${value}`);
      }
    }

    // OCR + structure detection (opt-in)
    if (options?.ocr) {
      const ocrResult = await performOcr(input, info);
      if (ocrResult) {
        parts.push("");
        parts.push("## Extracted Text\n");
        parts.push(ocrResult);
      }
    }

    return { markdown: parts.join("\n").trim() };
  }
}

function extractExifMetadata(input: Buffer): [string, string][] {
  const entries: [string, string][] = [];

  try {
    const tags = ExifReader(input);
    if (!tags) return entries;

    const mappings: [string, string[]][] = [
      ["Image Size", ["ImageWidth", "ImageHeight"]],
      ["Title", ["XPTitle", "title"]],
      ["Description", ["ImageDescription", "XPComment", "description"]],
      ["Keywords", ["XPKeywords", "subject"]],
      ["Artist", ["Artist", "XPAuthor"]],
      ["Date Created", ["DateTimeOriginal", "CreateDate"]],
      ["GPS Position", ["GPSLatitude", "GPSLongitude"]],
    ];

    for (const [label, keys] of mappings) {
      if (label === "Image Size") {
        const w = getTagValue(tags, "ImageWidth") ?? getTagValue(tags, "PixelXDimension");
        const h = getTagValue(tags, "ImageHeight") ?? getTagValue(tags, "PixelYDimension");
        if (w && h) {
          entries.push([label, `${w}x${h}`]);
        }
        continue;
      }
      if (label === "GPS Position") {
        const lat = getTagValue(tags, "GPSLatitude");
        const lon = getTagValue(tags, "GPSLongitude");
        if (lat && lon) {
          entries.push([label, `${lat}, ${lon}`]);
        }
        continue;
      }
      for (const key of keys) {
        const val = getTagValue(tags, key);
        if (val) {
          entries.push([label, val]);
          break;
        }
      }
    }
  } catch {
    // EXIF parsing failed — not all images have EXIF data
  }

  return entries;
}

function getTagValue(tags: any, key: string): string | undefined {
  // exif-reader returns different structures depending on the tag
  const tag = tags[key];
  if (tag === undefined || tag === null) return undefined;
  if (typeof tag === "string") return tag;
  if (typeof tag === "number") return String(tag);
  if (typeof tag === "object" && "description" in tag) return String(tag.description);
  if (typeof tag === "object" && "value" in tag) return String(tag.value);
  if (Array.isArray(tag)) return tag.join(", ");
  return String(tag);
}

async function performOcr(
  input: Buffer,
  _info: StreamInfo,
): Promise<string | null> {
  try {
    // Dynamic import to avoid loading tesseract.js when OCR is not used
    const Tesseract = await import("tesseract.js");
    const result = await Tesseract.recognize(input, "eng");
    const data = result.data as any;

    if (!data.words || data.words.length === 0) return null;

    // Map OCR words to PositionedWord for table detection
    const words: PositionedWord[] = (data.words as any[])
      .filter((w) => w.text.trim())
      .map((w) => ({
        text: w.text.trim(),
        x0: w.bbox.x0,
        x1: w.bbox.x1,
        top: w.bbox.y0,
      }));

    if (words.length === 0) return null;

    // Estimate page width from rightmost word
    const pageWidth = Math.max(...words.map((w) => w.x1)) + 10;

    // Try table detection
    const tableResult = detectTables(words, { pageWidth });
    if (tableResult) return tableResult;

    // Fall back to plain text from OCR
    return data.text?.trim() || null;
  } catch {
    return null;
  }
}
