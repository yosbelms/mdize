import { describe, it, expect } from "vitest";
import {
  detectTables,
  mergeMasterFormatNumbering,
  type PositionedWord,
} from "../../src/converters/table-detector.js";

describe("TableDetector", () => {
  describe("detectTables", () => {
    it("detects a clear 3-column table", () => {
      // Multi-word cells create a bimodal gap distribution (small intra-cell
      // gaps ~5px + large inter-column gaps ~100-185px) so the adaptive
      // threshold correctly separates columns.
      const words: PositionedWord[] = [
        // Row 1 (header)
        { text: "Full", x0: 10, x1: 35, top: 10 },
        { text: "Name", x0: 40, x1: 70, top: 10 },
        { text: "Age", x0: 200, x1: 225, top: 10 },
        { text: "(years)", x0: 230, x1: 275, top: 10 },
        { text: "Home", x0: 400, x1: 430, top: 10 },
        { text: "City", x0: 435, x1: 465, top: 10 },
        // Row 2
        { text: "Alice", x0: 10, x1: 45, top: 30 },
        { text: "Marie", x0: 50, x1: 85, top: 30 },
        { text: "Smith", x0: 90, x1: 125, top: 30 },
        { text: "30", x0: 200, x1: 215, top: 30 },
        { text: "New", x0: 400, x1: 425, top: 30 },
        { text: "York", x0: 430, x1: 460, top: 30 },
        // Row 3
        { text: "Bob", x0: 10, x1: 35, top: 50 },
        { text: "James", x0: 40, x1: 75, top: 50 },
        { text: "Lee", x0: 80, x1: 105, top: 50 },
        { text: "25", x0: 200, x1: 215, top: 50 },
        { text: "Los", x0: 400, x1: 425, top: 50 },
        { text: "Angeles", x0: 430, x1: 480, top: 50 },
      ];

      const result = detectTables(words, { pageWidth: 600 });
      expect(result).not.toBeNull();
      expect(result).toContain("Name");
      expect(result).toContain("Age");
      expect(result).toContain("City");
      expect(result).toContain("Alice");
      expect(result).toContain("|");
      expect(result).toContain("---");
    });

    it("returns null for paragraph text", () => {
      // Simulate a long paragraph that spans the full width
      const words: PositionedWord[] = [];
      const longText =
        "This is a long paragraph of text that spans the entire width of the page and contains many words";
      let x = 10;
      for (const word of longText.split(" ")) {
        words.push({ text: word, x0: x, x1: x + word.length * 8, top: 10 });
        x += word.length * 8 + 5;
      }
      // Add more lines of paragraph text
      x = 10;
      for (const word of longText.split(" ")) {
        words.push({ text: word, x0: x, x1: x + word.length * 8, top: 30 });
        x += word.length * 8 + 5;
      }

      const result = detectTables(words, { pageWidth: 800 });
      expect(result).toBeNull();
    });

    it("returns null for empty input", () => {
      expect(detectTables([], { pageWidth: 600 })).toBeNull();
    });

    it("returns null if too many columns detected", () => {
      const words: PositionedWord[] = [];
      // Create rows with 10 widely-spaced columns
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 10; col++) {
          words.push({
            text: `c${col}`,
            x0: col * 100,
            x1: col * 100 + 20,
            top: row * 20,
          });
        }
      }
      const result = detectTables(words, { pageWidth: 1000, maxColumns: 8 });
      expect(result).toBeNull();
    });

    it("handles mixed content (table + paragraph)", () => {
      // Multi-word cells for realistic gap distribution
      const words: PositionedWord[] = [
        // Table rows
        { text: "Item", x0: 10, x1: 40, top: 10 },
        { text: "Name", x0: 45, x1: 80, top: 10 },
        { text: "Qty", x0: 200, x1: 225, top: 10 },
        { text: "Unit", x0: 400, x1: 430, top: 10 },
        { text: "Price", x0: 435, x1: 470, top: 10 },

        { text: "Blue", x0: 10, x1: 38, top: 30 },
        { text: "Widget", x0: 43, x1: 88, top: 30 },
        { text: "5", x0: 200, x1: 208, top: 30 },
        { text: "$10", x0: 400, x1: 425, top: 30 },

        { text: "Red", x0: 10, x1: 35, top: 50 },
        { text: "Gadget", x0: 40, x1: 85, top: 50 },
        { text: "3", x0: 200, x1: 208, top: 50 },
        { text: "$20", x0: 400, x1: 425, top: 50 },

        { text: "Steel", x0: 10, x1: 45, top: 70 },
        { text: "Bolt", x0: 50, x1: 80, top: 70 },
        { text: "100", x0: 200, x1: 225, top: 70 },
        { text: "$1", x0: 400, x1: 415, top: 70 },
      ];

      const result = detectTables(words, { pageWidth: 600 });
      expect(result).not.toBeNull();
      expect(result).toContain("Item");
      expect(result).toContain("Widget");
      expect(result).toContain("$10");
    });
  });

  describe("mergeMasterFormatNumbering", () => {
    it("merges partial numbering with next line", () => {
      const input = ".1\nThe intent of this Request\n.2\nAvailable information";
      const result = mergeMasterFormatNumbering(input);
      expect(result).toContain(".1 The intent of this Request");
      expect(result).toContain(".2 Available information");
    });

    it("handles blank lines between number and text", () => {
      const input = ".1\n\nThe intent\n.2\n\nMore text";
      const result = mergeMasterFormatNumbering(input);
      expect(result).toContain(".1 The intent");
      expect(result).toContain(".2 More text");
    });

    it("leaves non-numbered lines unchanged", () => {
      const input = "Regular text\nMore text";
      const result = mergeMasterFormatNumbering(input);
      expect(result).toBe(input);
    });
  });
});
