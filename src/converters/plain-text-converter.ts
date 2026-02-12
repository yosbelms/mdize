import iconv from "iconv-lite";
import {
  DocumentConverter,
  type StreamInfo,
  type ConversionResult,
  type ConvertOptions,
} from "../base-converter.js";

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".text",
  ".md",
  ".markdown",
  ".json",
  ".jsonl",
  ".log",
  ".cfg",
  ".ini",
  ".yaml",
  ".yml",
  ".toml",
  ".env",
]);

export class PlainTextConverter extends DocumentConverter {
  accepts(_input: Buffer, info: StreamInfo): boolean {
    if (info.extension && TEXT_EXTENSIONS.has(info.extension)) {
      return true;
    }
    if (info.mimetype?.startsWith("text/")) {
      return true;
    }
    if (
      info.mimetype === "application/json" ||
      info.mimetype === "application/markdown"
    ) {
      return true;
    }
    return false;
  }

  async convert(
    input: Buffer,
    info: StreamInfo,
    _options?: ConvertOptions,
  ): Promise<ConversionResult> {
    const charset = info.charset ?? "utf-8";
    let text: string;

    if (iconv.encodingExists(charset)) {
      text = iconv.decode(input, charset);
    } else {
      text = input.toString("utf-8");
    }

    return { markdown: text.trim() };
  }
}
