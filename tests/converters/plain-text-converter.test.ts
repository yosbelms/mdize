import { describe, it, expect } from "vitest";
import { PlainTextConverter } from "../../src/converters/plain-text-converter.js";
import type { StreamInfo } from "../../src/base-converter.js";

describe("PlainTextConverter", () => {
  const converter = new PlainTextConverter();

  describe("accepts", () => {
    it("accepts .txt files", () => {
      expect(
        converter.accepts(Buffer.from(""), { extension: ".txt" }),
      ).toBe(true);
    });

    it("accepts .json files", () => {
      expect(
        converter.accepts(Buffer.from(""), { extension: ".json" }),
      ).toBe(true);
    });

    it("accepts .md files", () => {
      expect(
        converter.accepts(Buffer.from(""), { extension: ".md" }),
      ).toBe(true);
    });

    it("accepts text/* mimetypes", () => {
      expect(
        converter.accepts(Buffer.from(""), { mimetype: "text/plain" }),
      ).toBe(true);
    });

    it("accepts application/json", () => {
      expect(
        converter.accepts(Buffer.from(""), { mimetype: "application/json" }),
      ).toBe(true);
    });

    it("rejects .pdf files", () => {
      expect(
        converter.accepts(Buffer.from(""), { extension: ".pdf" }),
      ).toBe(false);
    });

    it("rejects unknown binary mimetypes", () => {
      expect(
        converter.accepts(Buffer.from(""), { mimetype: "application/pdf" }),
      ).toBe(false);
    });
  });

  describe("convert", () => {
    it("converts plain text", async () => {
      const input = Buffer.from("Hello, world!");
      const result = await converter.convert(input, { extension: ".txt" });
      expect(result.markdown).toBe("Hello, world!");
    });

    it("converts JSON content", async () => {
      const json = JSON.stringify({ key: "value" }, null, 2);
      const input = Buffer.from(json);
      const result = await converter.convert(input, { extension: ".json" });
      expect(result.markdown).toContain('"key": "value"');
    });

    it("trims whitespace", async () => {
      const input = Buffer.from("  hello  \n\n");
      const result = await converter.convert(input, { extension: ".txt" });
      expect(result.markdown).toBe("hello");
    });

    it("handles non-UTF8 with charset hint", async () => {
      const text = "こんにちは";
      const input = Buffer.from(text, "utf-8");
      const result = await converter.convert(input, {
        extension: ".txt",
        charset: "utf-8",
      });
      expect(result.markdown).toBe(text);
    });
  });
});
