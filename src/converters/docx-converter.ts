import mammoth from "mammoth";
import {
  DocumentConverter,
  type StreamInfo,
  type ConversionResult,
  type ConvertOptions,
} from "../base-converter.js";
import { convertHtmlString } from "./html-converter.js";

const DOCX_EXTENSIONS = new Set([".docx"]);
const DOCX_MIMETYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export class DocxConverter extends DocumentConverter {
  accepts(_input: Buffer, info: StreamInfo): boolean {
    if (info.extension && DOCX_EXTENSIONS.has(info.extension)) return true;
    if (info.mimetype && DOCX_MIMETYPES.has(info.mimetype)) return true;
    return false;
  }

  async convert(
    input: Buffer,
    _info: StreamInfo,
    options?: ConvertOptions,
  ): Promise<ConversionResult> {
    const result = await mammoth.convertToHtml({ buffer: input });
    return convertHtmlString(result.value, options);
  }
}
