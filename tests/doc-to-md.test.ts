import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { ToMd, UnsupportedFormatError } from "../src/index.js";

const TEST_FILES = join(import.meta.dirname, "test-files");

interface TestVector {
  filename: string;
  mustInclude: string[];
  mustNotInclude: string[];
}

const TEST_VECTORS: TestVector[] = [
  {
    filename: "test.docx",
    mustInclude: [
      "314b0a30-5b04-470b-b9f7-eed2c2bec74a",
      "49e168b7-d2ae-407f-a055-2167576f39a1",
    ],
    mustNotInclude: [],
  },
  {
    filename: "test.xlsx",
    mustInclude: [
      "6ff4173b-42a5-4784-9b19-f49caff4d93d",
      "affc7dad-52dc-4b98-9b5d-51e65d8a8ad0",
    ],
    mustNotInclude: [],
  },
  {
    filename: "test.pptx",
    mustInclude: [
      "2cdda5c8-e50e-4db4-b5f0-9722a649f455",
      "04191ea8-5c73-4215-a1d3-1cfb43aaaf12",
      "1b92870d-e3b5-4e65-8153-919f4ff45592",
      "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation",
    ],
    mustNotInclude: [],
  },
  {
    filename: "test.pdf",
    mustInclude: [
      "While there is contemporaneous exploration of multi-agent approaches",
    ],
    mustNotInclude: [],
  },
  {
    filename: "test_blog.html",
    mustInclude: [
      "Large language models (LLMs) are powerful tools",
    ],
    mustNotInclude: [],
  },
  // test_mskanji.csv requires explicit charset hint (cp932).
  // Tested separately in convertBuffer tests below.
  {
    filename: "test.json",
    mustInclude: [
      "5b64c88c-b3c3-4510-bcb8-da0b200602d8",
      "9700dc99-6685-40b4-9a3a-5e406dcb37f3",
    ],
    mustNotInclude: [],
  },
  {
    filename: "test_rss.xml",
    mustInclude: [
      "The Official Microsoft Blog",
    ],
    mustNotInclude: ["<rss", "<feed"],
  },
];

describe("ToMd (integration)", () => {
  const converter = new ToMd();

  describe("convertFile", () => {
    for (const vector of TEST_VECTORS) {
      it(`converts ${vector.filename}`, async () => {
        const result = await converter.convertFile(
          join(TEST_FILES, vector.filename),
        );

        for (const s of vector.mustInclude) {
          expect(result.markdown).toContain(s);
        }
        for (const s of vector.mustNotInclude) {
          expect(result.markdown).not.toContain(s);
        }
      });
    }
  });

  describe("convertBuffer", () => {
    it("converts DOCX buffer with streamInfo", async () => {
      const buf = await readFile(join(TEST_FILES, "test.docx"));
      const result = await converter.convertBuffer(buf, {
        extension: ".docx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      expect(result.markdown).toContain("314b0a30-5b04-470b-b9f7-eed2c2bec74a");
    });

    it("converts PDF buffer with extension only", async () => {
      const buf = await readFile(join(TEST_FILES, "test.pdf"));
      const result = await converter.convertBuffer(buf, {
        extension: ".pdf",
      });
      expect(result.markdown).toContain(
        "While there is contemporaneous exploration of multi-agent approaches",
      );
    });

    it("converts CSV with charset hint", async () => {
      const buf = await readFile(join(TEST_FILES, "test_mskanji.csv"));
      const result = await converter.convertBuffer(buf, {
        extension: ".csv",
        charset: "cp932",
      });
      expect(result.markdown).toContain("佐藤太郎");
    });
  });

  describe("convert (auto-detect)", () => {
    it("accepts file path string", async () => {
      const result = await converter.convert(
        join(TEST_FILES, "test.json"),
      );
      expect(result.markdown).toContain("5b64c88c-b3c3-4510-bcb8-da0b200602d8");
    });

    it("accepts buffer with streamInfo", async () => {
      const buf = await readFile(join(TEST_FILES, "test.xlsx"));
      const result = await converter.convert(buf, {
        streamInfo: { extension: ".xlsx" },
      });
      expect(result.markdown).toContain("6ff4173b-42a5-4784-9b19-f49caff4d93d");
    });
  });

  describe("error handling", () => {
    it("throws UnsupportedFormatError for unknown format", async () => {
      const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      await expect(
        converter.convertBuffer(buf, { extension: ".xyz" }),
      ).rejects.toThrow(UnsupportedFormatError);
    });
  });

  describe("custom converter registration", () => {
    it("allows registering custom converters", async () => {
      const custom = new ToMd({ enableBuiltins: false });

      custom.register({
        accepts: (_input, info) => info.extension === ".custom",
        convert: async () => ({ markdown: "custom output" }),
      } as any);

      const result = await custom.convertBuffer(Buffer.from("test"), {
        extension: ".custom",
      });
      expect(result.markdown).toBe("custom output");
    });
  });
});
