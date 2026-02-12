import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { DocxConverter } from "../../src/converters/docx-converter.js";

const TEST_FILES = join(import.meta.dirname, "../test-files");

describe("DocxConverter", () => {
  const converter = new DocxConverter();

  describe("accepts", () => {
    it("accepts .docx", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".docx" })).toBe(true);
    });

    it("accepts DOCX mimetype", () => {
      expect(
        converter.accepts(Buffer.from(""), {
          mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ).toBe(true);
    });

    it("rejects .pdf", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".pdf" })).toBe(false);
    });
  });

  describe("convert", () => {
    it("converts test.docx preserving structure", async () => {
      const buf = await readFile(join(TEST_FILES, "test.docx"));
      const result = await converter.convert(buf, { extension: ".docx" });

      // Check for known content from the Python test vectors
      expect(result.markdown).toContain("314b0a30-5b04-470b-b9f7-eed2c2bec74a");
      expect(result.markdown).toContain("49e168b7-d2ae-407f-a055-2167576f39a1");
    });

    it("preserves headings", async () => {
      const buf = await readFile(join(TEST_FILES, "test.docx"));
      const result = await converter.convert(buf, { extension: ".docx" });
      // The document should contain heading markers
      expect(result.markdown).toMatch(/^#{1,6}\s/m);
    });
  });
});
