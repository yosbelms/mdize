# ToMd

Convert documents to Markdown, preserving their structure (headings, lists, tables, links, images). The Markdown output is designed to be processed by AI, not humans.

An attempt to port to TypeScript [markitdown](https://github.com/microsoft/markitdown) Python library from Microsoft.

## Supported Formats

| Format | Extensions | Notes |
|--------|-----------|-------|
| PDF | `.pdf` | Rich text (headings, bold, italic, links), borderless table detection |
| DOCX | `.docx` | Via mammoth → HTML → Markdown |
| PPTX | `.pptx` | Slides, tables, charts, images, notes |
| XLSX | `.xlsx` | All sheets as Markdown tables |
| HTML | `.html`, `.htm` | Strips scripts/styles, preserves structure |
| CSV | `.csv` | Markdown table with charset auto-detection |
| Images | `.jpg`, `.png` | EXIF metadata + optional OCR with table detection |
| XML/RSS | `.xml`, `.rss`, `.atom` | RSS and Atom feed parsing |
| Plain text | `.txt`, `.md`, `.json` | Passthrough with charset handling |

## Installation

```bash
npm install tomd
```

Requires Node.js >= 18.

## Usage

```typescript
import { ToMd } from "tomd";

const converter = new ToMd();

// Convert a file
const result = await converter.convertFile("document.pdf");
console.log(result.markdown);

// Convert a buffer
import { readFile } from "node:fs/promises";
const buffer = await readFile("spreadsheet.xlsx");
const result2 = await converter.convertBuffer(buffer, { extension: ".xlsx" });
console.log(result2.markdown);

// Auto-detect: string = file path, Buffer = raw data
const result3 = await converter.convert("presentation.pptx");
```

### Options

```typescript
// Keep full data URIs (e.g. base64 images in DOCX/PPTX)
const result = await converter.convertFile("doc.docx", { keepDataUris: true });

// Enable OCR for images (requires tesseract.js)
const result = await converter.convertFile("invoice.jpg", { ocr: true });

// Provide charset hint for non-UTF8 files
const result = await converter.convertBuffer(csvBuffer, {
  extension: ".csv",
  charset: "cp932",
});
```

### Custom Converters

```typescript
import { ToMd, DocumentConverter, PRIORITY_SPECIFIC } from "tomd";

class MyConverter extends DocumentConverter {
  accepts(input, info) {
    return info.extension === ".custom";
  }

  async convert(input, info, options) {
    return { markdown: input.toString("utf-8") };
  }
}

const converter = new ToMd();
converter.register(new MyConverter(), PRIORITY_SPECIFIC);
```

## API

### `ToMd`

| Method | Description |
|--------|-------------|
| `convert(source, options?)` | Auto-detect: file path (string) or Buffer |
| `convertFile(path, options?)` | Convert a local file |
| `convertBuffer(buffer, info?, options?)` | Convert a Buffer with optional metadata |
| `register(converter, priority?)` | Register a custom converter |

### `ConversionResult`

```typescript
interface ConversionResult {
  markdown: string;  // The converted Markdown
  title?: string;    // Document title (from HTML <title>, etc.)
}
```

### `StreamInfo`

```typescript
interface StreamInfo {
  filename?: string;
  extension?: string;  // e.g. ".pdf"
  mimetype?: string;   // e.g. "application/pdf"
  charset?: string;    // e.g. "utf-8", "cp932"
}
```

### `ConvertOptions`

```typescript
interface ConvertOptions {
  url?: string;          // URL context for the document
  keepDataUris?: boolean; // Keep full base64 data URIs
  ocr?: boolean;          // Enable OCR for images
}
```

## Development

```bash
npm test          # Run tests
npm run build     # Build ESM + CJS
npm run typecheck # Type check
```

## License

MIT
