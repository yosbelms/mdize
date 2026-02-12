import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { XmlRssConverter } from "../../src/converters/xml-rss-converter.js";

const TEST_FILES = join(import.meta.dirname, "../test-files");

describe("XmlRssConverter", () => {
  const converter = new XmlRssConverter();

  describe("accepts", () => {
    it("accepts .xml that is an RSS feed", async () => {
      const buf = await readFile(join(TEST_FILES, "test_rss.xml"));
      expect(converter.accepts(buf, { extension: ".xml" })).toBe(true);
    });

    it("accepts text/xml mimetype for RSS feed", async () => {
      const buf = await readFile(join(TEST_FILES, "test_rss.xml"));
      expect(converter.accepts(buf, { mimetype: "text/xml" })).toBe(true);
    });

    it("rejects non-feed XML", () => {
      const buf = Buffer.from('<?xml version="1.0"?><root><item>data</item></root>');
      expect(converter.accepts(buf, { extension: ".xml" })).toBe(false);
    });

    it("rejects .html", () => {
      expect(
        converter.accepts(Buffer.from("<html></html>"), { extension: ".html" }),
      ).toBe(false);
    });
  });

  describe("convert", () => {
    it("converts RSS feed with titles and content", async () => {
      const buf = await readFile(join(TEST_FILES, "test_rss.xml"));
      const result = await converter.convert(buf, {
        extension: ".xml",
        mimetype: "text/xml",
        charset: "utf-8",
      });

      // From Python test vectors
      expect(result.markdown).toContain("The Official Microsoft Blog");
      expect(result.markdown).not.toContain("<rss");
      expect(result.markdown).not.toContain("<feed");
    });

    it("extracts feed title", async () => {
      const buf = await readFile(join(TEST_FILES, "test_rss.xml"));
      const result = await converter.convert(buf, { extension: ".xml" });
      expect(result.markdown).toMatch(/^# /m);
    });
  });
});
