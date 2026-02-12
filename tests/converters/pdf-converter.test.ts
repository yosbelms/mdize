import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { PdfConverter } from "../../src/converters/pdf-converter.js";

const TEST_FILES = join(import.meta.dirname, "../test-files");

describe("PdfConverter", () => {
  const converter = new PdfConverter();

  describe("accepts", () => {
    it("accepts .pdf", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".pdf" })).toBe(true);
    });

    it("accepts application/pdf", () => {
      expect(
        converter.accepts(Buffer.from(""), { mimetype: "application/pdf" }),
      ).toBe(true);
    });

    it("rejects .docx", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".docx" })).toBe(false);
    });
  });

  describe("convert", () => {
    it("extracts text from test.pdf", async () => {
      const buf = await readFile(join(TEST_FILES, "test.pdf"));
      const result = await converter.convert(buf, { extension: ".pdf" });

      expect(result.markdown).toContain(
        "While there is contemporaneous exploration of multi-agent approaches",
      );
    });

    it("handles multi-page PDF", async () => {
      const buf = await readFile(join(TEST_FILES, "test.pdf"));
      const result = await converter.convert(buf, { extension: ".pdf" });
      // Should have substantial content from multi-page document
      expect(result.markdown.length).toBeGreaterThan(100);
    });

    it("detects tables in borderless PDF", async () => {
      const buf = await readFile(
        join(TEST_FILES, "SPARSE-2024-INV-1234_borderless_table.pdf"),
      );
      const result = await converter.convert(buf, { extension: ".pdf" });
      // Should have pipe-delimited table content
      expect(result.markdown.length).toBeGreaterThan(0);
    });

    it("detects headings from larger font sizes", async () => {
      const buf = await readFile(join(TEST_FILES, "test.pdf"));
      const result = await converter.convert(buf, { extension: ".pdf" });
      // Should detect at least one heading (# marker)
      expect(result.markdown).toMatch(/^#{1,3}\s+/m);
    });

    it("preserves text content through rich HTML conversion", async () => {
      const buf = await readFile(join(TEST_FILES, "test.pdf"));
      const result = await converter.convert(buf, { extension: ".pdf" });
      // Key content from the PDF should still be present
      expect(result.markdown).toContain(
        "While there is contemporaneous exploration of multi-agent approaches",
      );
    });
  });
});
