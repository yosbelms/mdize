import { readFile } from "node:fs/promises";
import { extname, basename } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import {
  DocumentConverter,
  type StreamInfo,
  type ConversionResult,
  type ConvertOptions,
} from "./base-converter.js";
import {
  UnsupportedFormatError,
  FileConversionError,
  type FailedConversionAttempt,
} from "./errors.js";
import { XmlRssConverter } from "./converters/xml-rss-converter.js";
import { HtmlConverter } from "./converters/html-converter.js";
import { PdfConverter } from "./converters/pdf-converter.js";
import { DocxConverter } from "./converters/docx-converter.js";
import { PptxConverter } from "./converters/pptx-converter.js";
import { XlsxConverter } from "./converters/xlsx-converter.js";
import { CsvConverter } from "./converters/csv-converter.js";
import { ImageConverter } from "./converters/image-converter.js";
import { PlainTextConverter } from "./converters/plain-text-converter.js";

export const PRIORITY_SPECIFIC = 0.0;
export const PRIORITY_GENERIC = 10.0;

interface ConverterRegistration {
  converter: DocumentConverter;
  priority: number;
}

export interface MdizeOptions {
  /** If false, no built-in converters are registered. Default: true */
  enableBuiltins?: boolean;
}

export class Mdize {
  private registrations: ConverterRegistration[] = [];

  constructor(options?: MdizeOptions) {
    const enableBuiltins = options?.enableBuiltins ?? true;
    if (enableBuiltins) {
      this.registerBuiltins();
    }
  }

  register(converter: DocumentConverter, priority = PRIORITY_SPECIFIC): void {
    this.registrations.push({ converter, priority });
  }

  async convert(
    source: string | Buffer,
    options?: ConvertOptions & { streamInfo?: StreamInfo },
  ): Promise<ConversionResult> {
    if (typeof source === "string") {
      return this.convertFile(source, options);
    }
    return this.convertBuffer(source, options?.streamInfo, options);
  }

  async convertFile(
    filePath: string,
    options?: ConvertOptions,
  ): Promise<ConversionResult> {
    const buffer = await readFile(filePath);
    const info: StreamInfo = {
      filename: basename(filePath),
      localPath: filePath,
      extension: extname(filePath).toLowerCase(),
    };
    return this.convertBuffer(buffer, info, options);
  }

  async convertBuffer(
    buffer: Buffer,
    info?: StreamInfo,
    options?: ConvertOptions,
  ): Promise<ConversionResult> {
    const resolvedInfo = await this.resolveStreamInfo(buffer, info);
    const sorted = [...this.registrations].sort(
      (a, b) => a.priority - b.priority,
    );

    const attempts: FailedConversionAttempt[] = [];

    for (const { converter } of sorted) {
      if (!converter.accepts(buffer, resolvedInfo)) {
        continue;
      }
      try {
        return await converter.convert(buffer, resolvedInfo, options);
      } catch (err) {
        attempts.push({
          converter: converter.constructor.name,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }

    if (attempts.length > 0) {
      throw new FileConversionError(
        `All matching converters failed for ${resolvedInfo.filename ?? "input"}`,
        attempts,
      );
    }

    throw new UnsupportedFormatError(
      `No converter found for ${resolvedInfo.filename ?? "input"} (mimetype: ${resolvedInfo.mimetype ?? "unknown"}, ext: ${resolvedInfo.extension ?? "unknown"})`,
    );
  }

  private async resolveStreamInfo(
    buffer: Buffer,
    info?: StreamInfo,
  ): Promise<StreamInfo> {
    const resolved: StreamInfo = { ...info };

    if (!resolved.mimetype || !resolved.extension) {
      try {
        const detected = await fileTypeFromBuffer(buffer);
        if (detected) {
          if (!resolved.mimetype) resolved.mimetype = detected.mime;
          if (!resolved.extension) resolved.extension = `.${detected.ext}`;
        }
      } catch {
        // file-type detection failed, continue with what we have
      }
    }

    return resolved;
  }

  private registerBuiltins(): void {
    // Specific format converters (priority 0.0)
    this.register(new XmlRssConverter());
    this.register(new HtmlConverter());
    this.register(new PdfConverter());
    this.register(new DocxConverter());
    this.register(new PptxConverter());
    this.register(new XlsxConverter());
    this.register(new CsvConverter());
    this.register(new ImageConverter());

    // Generic fallback (priority 10.0)
    this.register(new PlainTextConverter(), PRIORITY_GENERIC);
  }
}
