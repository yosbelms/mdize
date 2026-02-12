export interface StreamInfo {
  filename?: string;
  localPath?: string;
  extension?: string;
  mimetype?: string;
  charset?: string;
  url?: string;
}

export interface ConversionResult {
  markdown: string;
  title?: string;
}

export interface ConvertOptions {
  /** URL context for the document (used by specialized HTML converters) */
  url?: string;
  /** Keep data URIs in full instead of truncating */
  keepDataUris?: boolean;
  /** Enable OCR for images (default: false) */
  ocr?: boolean;
}

export abstract class DocumentConverter {
  abstract accepts(input: Buffer, info: StreamInfo): boolean;
  abstract convert(
    input: Buffer,
    info: StreamInfo,
    options?: ConvertOptions,
  ): Promise<ConversionResult>;
}
