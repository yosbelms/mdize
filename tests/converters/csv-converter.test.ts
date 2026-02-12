import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { CsvConverter } from "../../src/converters/csv-converter.js";

const TEST_FILES = join(import.meta.dirname, "../test-files");

describe("CsvConverter", () => {
  const converter = new CsvConverter();

  describe("accepts", () => {
    it("accepts .csv", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".csv" })).toBe(true);
    });

    it("accepts text/csv", () => {
      expect(converter.accepts(Buffer.from(""), { mimetype: "text/csv" })).toBe(true);
    });

    it("rejects .xlsx", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".xlsx" })).toBe(false);
    });
  });

  describe("convert", () => {
    it("converts basic CSV to markdown table", async () => {
      const csv = "Name,Age,City\nAlice,30,NYC\nBob,25,LA\n";
      const result = await converter.convert(Buffer.from(csv), { extension: ".csv" });
      expect(result.markdown).toContain("| Name | Age | City |");
      expect(result.markdown).toContain("| --- | --- | --- |");
      expect(result.markdown).toContain("| Alice | 30 | NYC |");
      expect(result.markdown).toContain("| Bob | 25 | LA |");
    });

    it("handles empty CSV", async () => {
      const result = await converter.convert(Buffer.from(""), { extension: ".csv" });
      expect(result.markdown).toBe("");
    });

    it("pads short rows", async () => {
      const csv = "A,B,C\n1\n";
      const result = await converter.convert(Buffer.from(csv), { extension: ".csv" });
      expect(result.markdown).toContain("| 1 |  |  |");
    });

    it("converts Japanese CSV with cp932 encoding", async () => {
      const buf = await readFile(join(TEST_FILES, "test_mskanji.csv"));
      const result = await converter.convert(buf, {
        extension: ".csv",
        charset: "cp932",
      });
      expect(result.markdown).toContain("| 名前 | 年齢 | 住所 |");
      expect(result.markdown).toContain("| --- | --- | --- |");
      expect(result.markdown).toContain("| 佐藤太郎 | 30 | 東京 |");
      expect(result.markdown).toContain("| 三木英子 | 25 | 大阪 |");
      expect(result.markdown).toContain("| 髙橋淳 | 35 | 名古屋 |");
    });
  });
});
