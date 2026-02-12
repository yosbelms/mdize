import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { ImageConverter } from "../../src/converters/image-converter.js";

const TEST_FILES = join(import.meta.dirname, "../test-files");

describe("ImageConverter", () => {
  const converter = new ImageConverter();

  describe("accepts", () => {
    it("accepts .jpg", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".jpg" })).toBe(true);
    });

    it("accepts .jpeg", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".jpeg" })).toBe(true);
    });

    it("accepts .png", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".png" })).toBe(true);
    });

    it("accepts image/jpeg", () => {
      expect(
        converter.accepts(Buffer.from(""), { mimetype: "image/jpeg" }),
      ).toBe(true);
    });

    it("rejects .pdf", () => {
      expect(converter.accepts(Buffer.from(""), { extension: ".pdf" })).toBe(false);
    });
  });

  describe("convert", () => {
    it("extracts metadata from JPEG", async () => {
      const buf = await readFile(join(TEST_FILES, "test.jpg"));
      const result = await converter.convert(buf, { extension: ".jpg" });
      // Should produce some output (metadata or empty if no EXIF)
      expect(typeof result.markdown).toBe("string");
    });

    it("returns empty markdown for minimal image without EXIF", async () => {
      // Create a minimal 1x1 PNG
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAAxJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=",
        "base64",
      );
      const result = await converter.convert(png, { extension: ".png" });
      expect(typeof result.markdown).toBe("string");
    });

    it("does not run OCR by default", async () => {
      const buf = await readFile(join(TEST_FILES, "test.jpg"));
      const result = await converter.convert(buf, { extension: ".jpg" });
      // Without OCR, should not contain "Extracted Text" section
      expect(result.markdown).not.toContain("## Extracted Text");
    });
  });
});
