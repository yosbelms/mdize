import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import jschardet from "jschardet";
import {
  DocumentConverter,
  type StreamInfo,
  type ConversionResult,
  type ConvertOptions,
} from "../base-converter.js";

const CSV_EXTENSIONS = new Set([".csv"]);
const CSV_MIMETYPES = new Set(["text/csv", "application/csv"]);

export class CsvConverter extends DocumentConverter {
  accepts(_input: Buffer, info: StreamInfo): boolean {
    if (info.extension && CSV_EXTENSIONS.has(info.extension)) return true;
    if (info.mimetype && CSV_MIMETYPES.has(info.mimetype)) return true;
    return false;
  }

  async convert(
    input: Buffer,
    info: StreamInfo,
    _options?: ConvertOptions,
  ): Promise<ConversionResult> {
    let charset = info.charset;
    if (!charset) {
      // Auto-detect encoding
      const detected = jschardet.detect(input);
      if (detected?.encoding && detected.confidence > 0.5) {
        charset = detected.encoding;
      } else {
        charset = "utf-8";
      }
    }

    let text: string;
    if (iconv.encodingExists(charset)) {
      text = iconv.decode(input, charset);
    } else {
      text = input.toString("utf-8");
    }

    // Remove BOM if present
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    const records: string[][] = parse(text, {
      relax_column_count: true,
      skip_empty_lines: true,
    });

    if (records.length === 0) {
      return { markdown: "" };
    }

    const header = records[0];
    const numCols = header.length;

    const lines: string[] = [];

    // Header row
    lines.push("| " + header.join(" | ") + " |");
    // Separator
    lines.push("| " + header.map(() => "---").join(" | ") + " |");

    // Data rows
    for (let i = 1; i < records.length; i++) {
      const row = records[i];
      // Pad or truncate to match header columns
      const cells: string[] = [];
      for (let j = 0; j < numCols; j++) {
        cells.push(row[j] ?? "");
      }
      lines.push("| " + cells.join(" | ") + " |");
    }

    return { markdown: lines.join("\n") };
  }
}
