import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { PptxConverter } from "../../src/converters/pptx-converter.js";

const TEST_FILES = join(import.meta.dirname, "../test-files");

describe("PptxConverter", () => {
  const converter = new PptxConverter();

  describe("accepts", () => {
    it("accepts .pptx", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".pptx" })).toBe(true);
    });

    it("accepts PPTX mimetype", () => {
      expect(
        converter.accepts(Buffer.from(""), {
          mimetype:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        }),
      ).toBe(true);
    });

    it("rejects .docx", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".docx" })).toBe(false);
    });
  });

  describe("convert", () => {
    it("converts test.pptx with slide text", async () => {
      const buf = await readFile(join(TEST_FILES, "test.pptx"));
      const result = await converter.convert(buf, { extension: ".pptx" });

      // Known content from Python test vectors
      expect(result.markdown).toContain("2cdda5c8-e50e-4db4-b5f0-9722a649f455");
      expect(result.markdown).toContain("04191ea8-5c73-4215-a1d3-1cfb43aaaf12");
      expect(result.markdown).toContain("1b92870d-e3b5-4e65-8153-919f4ff45592");
      expect(result.markdown).toContain(
        "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation",
      );
    });

    it("extracts image references", async () => {
      const buf = await readFile(join(TEST_FILES, "test.pptx"));
      const result = await converter.convert(buf, { extension: ".pptx" });

      // Should have image markdown
      expect(result.markdown).toMatch(/!\[.*\]\(.*\)/);
    });
  });
});
