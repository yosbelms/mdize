import ExcelJS from "exceljs";
import {
  DocumentConverter,
  type StreamInfo,
  type ConversionResult,
  type ConvertOptions,
} from "../base-converter.js";
import { convertHtmlString } from "./html-converter.js";

const XLSX_EXTENSIONS = new Set([".xlsx"]);
const XLSX_MIMETYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export class XlsxConverter extends DocumentConverter {
  accepts(_input: Buffer, info: StreamInfo): boolean {
    if (info.extension && XLSX_EXTENSIONS.has(info.extension)) return true;
    if (info.mimetype && XLSX_MIMETYPES.has(info.mimetype)) return true;
    return false;
  }

  async convert(
    input: Buffer,
    _info: StreamInfo,
    options?: ConvertOptions,
  ): Promise<ConversionResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(input as unknown as ExcelJS.Buffer);

    const parts: string[] = [];

    workbook.eachSheet((sheet) => {
      parts.push(`## ${sheet.name}\n`);

      const rows: string[][] = [];
      sheet.eachRow((row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          cells.push(cellToString(cell));
        });
        rows.push(cells);
      });

      if (rows.length === 0) return;

      // Normalize all rows to the same column count
      const maxCols = Math.max(...rows.map((r) => r.length));
      for (const row of rows) {
        while (row.length < maxCols) row.push("");
      }

      // Build HTML table, then convert to markdown
      let html = "<table><thead><tr>";
      for (const cell of rows[0]) {
        html += `<th>${escapeHtml(cell)}</th>`;
      }
      html += "</tr></thead><tbody>";
      for (let i = 1; i < rows.length; i++) {
        html += "<tr>";
        for (const cell of rows[i]) {
          html += `<td>${escapeHtml(cell)}</td>`;
        }
        html += "</tr>";
      }
      html += "</tbody></table>";

      const { markdown } = convertHtmlString(html, options);
      parts.push(markdown);
    });

    return { markdown: parts.join("\n\n").trim() };
  }
}

function cellToString(cell: ExcelJS.Cell): string {
  if (cell.value === null || cell.value === undefined) return "";
  if (typeof cell.value === "object" && "richText" in cell.value) {
    return (cell.value as ExcelJS.CellRichTextValue).richText
      .map((rt) => rt.text)
      .join("");
  }
  if (typeof cell.value === "object" && "text" in cell.value) {
    return String((cell.value as { text: string }).text);
  }
  if (cell.value instanceof Date) {
    return cell.value.toISOString();
  }
  return String(cell.value);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
