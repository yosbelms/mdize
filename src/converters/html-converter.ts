import * as cheerio from "cheerio";
import TurndownService from "turndown";
// @ts-ignore
import { gfm } from "turndown-plugin-gfm";
import {
  DocumentConverter,
  type StreamInfo,
  type ConversionResult,
  type ConvertOptions,
} from "../base-converter.js";

const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const HTML_MIMETYPES = new Set([
  "text/html",
  "application/xhtml+xml",
]);

function createTurndownService(options?: ConvertOptions): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  td.use(gfm);

  // Remove script and style tags
  td.remove(["script", "style", "noscript"]);

  // Handle checkboxes
  td.addRule("checkbox", {
    filter(node) {
      return (
        node.nodeName === "INPUT" &&
        (node as HTMLInputElement).type === "checkbox"
      );
    },
    replacement(_content, node) {
      const checked = (node as HTMLInputElement).checked;
      return checked ? "[x] " : "[ ] ";
    },
  });

  // Truncate data URIs unless keepDataUris is set
  if (!options?.keepDataUris) {
    td.addRule("truncateDataUri", {
      filter(node) {
        if (node.nodeName !== "IMG") return false;
        const src = (node as HTMLImageElement).getAttribute("src") ?? "";
        return src.startsWith("data:");
      },
      replacement(_content, node) {
        const el = node as HTMLImageElement;
        const alt = el.getAttribute("alt") ?? "";
        const src = el.getAttribute("src") ?? "";
        // Truncate data URI to prefix + "..."
        const truncated = src.replace(
          /^(data:[^;]+;base64,).+$/,
          "$1...",
        );
        return `![${alt}](${truncated})`;
      },
    });
  }

  return td;
}

export function convertHtmlString(
  html: string,
  options?: ConvertOptions,
): ConversionResult {
  const $ = cheerio.load(html);

  // Remove script and style elements before conversion
  $("script, style, noscript").remove();

  const title = $("title").first().text().trim() || undefined;

  // Get body content, or full document if no body
  const body = $("body").length > 0 ? $("body").html() : $.html();
  if (!body) {
    return { markdown: "", title };
  }

  const td = createTurndownService(options);
  let markdown = td.turndown(body);

  // Normalize excessive blank lines
  markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();

  return { markdown, title };
}

export class HtmlConverter extends DocumentConverter {
  accepts(_input: Buffer, info: StreamInfo): boolean {
    if (info.extension && HTML_EXTENSIONS.has(info.extension)) {
      return true;
    }
    if (info.mimetype && HTML_MIMETYPES.has(info.mimetype)) {
      return true;
    }
    return false;
  }

  async convert(
    input: Buffer,
    info: StreamInfo,
    options?: ConvertOptions,
  ): Promise<ConversionResult> {
    const charset = info.charset ?? "utf-8";
    const html = input.toString(charset as BufferEncoding);
    return convertHtmlString(html, options);
  }
}
