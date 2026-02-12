import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { HtmlConverter, convertHtmlString } from "../../src/converters/html-converter.js";

const TEST_FILES = join(import.meta.dirname, "../test-files");

describe("HtmlConverter", () => {
  const converter = new HtmlConverter();

  describe("accepts", () => {
    it("accepts .html", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".html" })).toBe(true);
    });

    it("accepts .htm", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".htm" })).toBe(true);
    });

    it("accepts text/html mimetype", () => {
      expect(converter.accepts(Buffer.from(""), { mimetype: "text/html" })).toBe(true);
    });

    it("rejects .pdf", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".pdf" })).toBe(false);
    });
  });

  describe("convertHtmlString", () => {
    it("converts headings", () => {
      const result = convertHtmlString("<h1>Title</h1><h2>Subtitle</h2>");
      expect(result.markdown).toContain("# Title");
      expect(result.markdown).toContain("## Subtitle");
    });

    it("converts lists", () => {
      const result = convertHtmlString("<ul><li>A</li><li>B</li></ul>");
      expect(result.markdown).toMatch(/-\s+A/);
      expect(result.markdown).toMatch(/-\s+B/);
    });

    it("converts tables", () => {
      const html = `
        <table>
          <thead><tr><th>Name</th><th>Age</th></tr></thead>
          <tbody><tr><td>Alice</td><td>30</td></tr></tbody>
        </table>`;
      const result = convertHtmlString(html);
      expect(result.markdown).toContain("Name");
      expect(result.markdown).toContain("Age");
      expect(result.markdown).toContain("Alice");
      expect(result.markdown).toContain("30");
      expect(result.markdown).toContain("|");
    });

    it("converts links", () => {
      const result = convertHtmlString('<a href="https://example.com">Click</a>');
      expect(result.markdown).toContain("[Click](https://example.com)");
    });

    it("removes script and style tags", () => {
      const html = `
        <div>
          <script>alert('xss')</script>
          <style>.red { color: red; }</style>
          <p>Content</p>
        </div>`;
      const result = convertHtmlString(html);
      expect(result.markdown).not.toContain("alert");
      expect(result.markdown).not.toContain(".red");
      expect(result.markdown).toContain("Content");
    });

    it("extracts title", () => {
      const html = "<html><head><title>My Page</title></head><body><p>Hi</p></body></html>";
      const result = convertHtmlString(html);
      expect(result.title).toBe("My Page");
    });

    it("truncates data URIs by default", () => {
      const html = '<img alt="test" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAAxJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=" />';
      const result = convertHtmlString(html);
      expect(result.markdown).toContain("data:image/png;base64,...");
      expect(result.markdown).not.toContain("iVBORw0KGgo");
    });

    it("keeps data URIs when option set", () => {
      const html = '<img alt="test" src="data:image/png;base64,iVBORw0KGgo" />';
      const result = convertHtmlString(html, { keepDataUris: true });
      expect(result.markdown).toContain("iVBORw0KGgo");
    });

    it("normalizes excessive whitespace", () => {
      const html = "<p>A</p>\n\n\n\n\n<p>B</p>";
      const result = convertHtmlString(html);
      expect(result.markdown).not.toMatch(/\n{3,}/);
    });
  });

  describe("convert (file)", () => {
    it("converts test_blog.html", async () => {
      const buf = await readFile(join(TEST_FILES, "test_blog.html"));
      const result = await converter.convert(buf, {
        extension: ".html",
        charset: "utf-8",
      });
      expect(result.markdown).toContain(
        "Large language models (LLMs) are powerful tools",
      );
    });
  });
});
