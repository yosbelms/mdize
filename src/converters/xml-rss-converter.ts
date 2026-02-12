import { XMLParser } from "fast-xml-parser";
import {
  DocumentConverter,
  type StreamInfo,
  type ConversionResult,
  type ConvertOptions,
} from "../base-converter.js";
import { convertHtmlString } from "./html-converter.js";

const XML_EXTENSIONS = new Set([".xml", ".rss", ".atom"]);
const XML_MIMETYPES = new Set([
  "text/xml",
  "application/xml",
  "application/rss+xml",
  "application/atom+xml",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

export class XmlRssConverter extends DocumentConverter {
  accepts(input: Buffer, info: StreamInfo): boolean {
    if (info.mimetype && XML_MIMETYPES.has(info.mimetype)) {
      return this.isFeed(input);
    }
    if (info.extension && XML_EXTENSIONS.has(info.extension)) {
      return this.isFeed(input);
    }
    return false;
  }

  async convert(
    input: Buffer,
    _info: StreamInfo,
    options?: ConvertOptions,
  ): Promise<ConversionResult> {
    const xml = input.toString("utf-8");
    const parsed = parser.parse(xml);

    // RSS feed
    if (parsed.rss?.channel) {
      return this.convertRss(parsed.rss.channel, options);
    }

    // Atom feed
    if (parsed.feed) {
      return this.convertAtom(parsed.feed, options);
    }

    throw new Error("Not a recognized RSS or Atom feed");
  }

  private isFeed(input: Buffer): boolean {
    try {
      const xml = input.toString("utf-8");
      const parsed = parser.parse(xml);
      return !!(parsed.rss?.channel || parsed.feed);
    } catch {
      return false;
    }
  }

  private convertRss(
    channel: any,
    options?: ConvertOptions,
  ): ConversionResult {
    const parts: string[] = [];
    const title = channel.title;

    if (title) {
      parts.push(`# ${title}`);
    }
    if (channel.description) {
      parts.push(String(channel.description));
    }

    const items = asArray(channel.item);
    for (const item of items) {
      const itemTitle = item.title ? String(item.title) : "Untitled";
      const link = item.link ? String(item.link) : "";

      if (link) {
        parts.push(`## [${itemTitle}](${link})`);
      } else {
        parts.push(`## ${itemTitle}`);
      }

      if (item.description) {
        const desc = String(item.description);
        // Description might contain HTML
        if (desc.includes("<")) {
          const { markdown } = convertHtmlString(desc, options);
          parts.push(markdown);
        } else {
          parts.push(desc);
        }
      }

      if (item["content:encoded"]) {
        const content = String(item["content:encoded"]);
        const { markdown } = convertHtmlString(content, options);
        parts.push(markdown);
      }
    }

    return { markdown: parts.join("\n\n").trim(), title: title ? String(title) : undefined };
  }

  private convertAtom(
    feed: any,
    options?: ConvertOptions,
  ): ConversionResult {
    const parts: string[] = [];
    const title = feed.title;

    if (title) {
      parts.push(`# ${typeof title === "object" ? title["#text"] ?? title : title}`);
    }
    if (feed.subtitle) {
      parts.push(String(feed.subtitle));
    }

    const entries = asArray(feed.entry);
    for (const entry of entries) {
      const entryTitle = entry.title
        ? typeof entry.title === "object"
          ? entry.title["#text"] ?? entry.title
          : String(entry.title)
        : "Untitled";

      const link = entry.link?.["@_href"] ?? "";

      if (link) {
        parts.push(`## [${entryTitle}](${link})`);
      } else {
        parts.push(`## ${entryTitle}`);
      }

      const content = entry.content ?? entry.summary;
      if (content) {
        const text = typeof content === "object" ? content["#text"] ?? "" : String(content);
        if (text.includes("<")) {
          const { markdown } = convertHtmlString(text, options);
          parts.push(markdown);
        } else {
          parts.push(text);
        }
      }
    }

    return {
      markdown: parts.join("\n\n").trim(),
      title: title ? String(typeof title === "object" ? title["#text"] ?? title : title) : undefined,
    };
  }
}

function asArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}
