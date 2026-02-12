import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { XlsxConverter } from "../../src/converters/xlsx-converter.js";

const TEST_FILES = join(import.meta.dirname, "../test-files");

describe("XlsxConverter", () => {
  const converter = new XlsxConverter();

  describe("accepts", () => {
    it("accepts .xlsx", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".xlsx" })).toBe(true);
    });

    it("accepts XLSX mimetype", () => {
      expect(
        converter.accepts(Buffer.from(""), {
          mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      ).toBe(true);
    });

    it("rejects .csv", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".csv" })).toBe(false);
    });
  });

  describe("convert", () => {
    it("converts test.xlsx with sheet names and values", async () => {
      const buf = await readFile(join(TEST_FILES, "test.xlsx"));
      const result = await converter.convert(buf, { extension: ".xlsx" });

      // Known values from Python test vectors
      expect(result.markdown).toContain("6ff4173b-42a5-4784-9b19-f49caff4d93d");
      expect(result.markdown).toContain("affc7dad-52dc-4b98-9b5d-51e65d8a8ad0");
    });

    it("includes sheet name headings", async () => {
      const buf = await readFile(join(TEST_FILES, "test.xlsx"));
      const result = await converter.convert(buf, { extension: ".xlsx" });
      expect(result.markdown).toMatch(/^## /m);
    });
  });
});
