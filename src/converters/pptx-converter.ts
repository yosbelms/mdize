import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import {
  DocumentConverter,
  type StreamInfo,
  type ConversionResult,
  type ConvertOptions,
} from "../base-converter.js";
import { convertHtmlString } from "./html-converter.js";

const PPTX_EXTENSIONS = new Set([".pptx"]);
const PPTX_MIMETYPES = new Set([
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => {
    // These elements can appear multiple times
    return [
      "a:p",
      "a:r",
      "a:br",
      "p:sp",
      "p:pic",
      "p:graphicFrame",
      "p:grpSp",
      "a:tr",
      "a:tc",
      "c:ser",
      "c:pt",
      "c:cat",
      "c:val",
      "c:numRef",
      "c:strRef",
      "c:numCache",
      "c:strCache",
      "p:cNvPr",
    ].includes(name);
  },
});

export class PptxConverter extends DocumentConverter {
  accepts(_input: Buffer, info: StreamInfo): boolean {
    if (info.extension && PPTX_EXTENSIONS.has(info.extension)) return true;
    if (info.mimetype && PPTX_MIMETYPES.has(info.mimetype)) return true;
    return false;
  }

  async convert(
    input: Buffer,
    _info: StreamInfo,
    options?: ConvertOptions,
  ): Promise<ConversionResult> {
    const zip = await JSZip.loadAsync(input);

    // Get slide order from presentation.xml
    const presXml = await zip.file("ppt/presentation.xml")?.async("string");
    if (!presXml) throw new Error("Invalid PPTX: missing presentation.xml");

    const pres = xmlParser.parse(presXml);
    const slideIds = getSlideIds(pres);

    // Get slide relationships to map rId -> slide file
    const presRelsXml = await zip
      .file("ppt/_rels/presentation.xml.rels")
      ?.async("string");
    if (!presRelsXml) throw new Error("Invalid PPTX: missing presentation.xml.rels");

    const presRels = xmlParser.parse(presRelsXml);
    const rIdToFile = buildRelMap(presRels);

    const parts: string[] = [];

    for (const rId of slideIds) {
      const slideFile = rIdToFile[rId];
      if (!slideFile) continue;

      const slidePath = `ppt/${slideFile}`;
      const slideXml = await zip.file(slidePath)?.async("string");
      if (!slideXml) continue;

      const slide = xmlParser.parse(slideXml);

      // Get slide-level relationships (for images, charts)
      const slideRelsPath = slidePath.replace(
        /([^/]+)$/,
        "_rels/$1.rels",
      );
      const slideRelsXml = await zip.file(slideRelsPath)?.async("string");
      const slideRelMap = slideRelsXml
        ? buildRelMap(xmlParser.parse(slideRelsXml))
        : {};

      const slideMarkdown = await processSlide(
        slide,
        slideRelMap,
        zip,
        slidePath,
        options,
      );
      if (slideMarkdown.trim()) {
        parts.push(slideMarkdown.trim());
      }

      // Process slide notes
      const noteRId = Object.entries(slideRelMap).find(([, v]) =>
        v.includes("notesSlide"),
      );
      if (noteRId) {
        const notePath = resolveRelPath(slidePath, noteRId[1]);
        const noteXml = await zip.file(notePath)?.async("string");
        if (noteXml) {
          const noteText = extractAllText(xmlParser.parse(noteXml));
          if (noteText.trim()) {
            parts.push(`### Notes:\n${noteText.trim()}`);
          }
        }
      }
    }

    return { markdown: parts.join("\n\n").trim() };
  }
}

function getSlideIds(pres: any): string[] {
  const sldIdLst =
    pres?.["p:presentation"]?.["p:sldIdLst"]?.["p:sldId"];
  if (!sldIdLst) return [];
  const arr = Array.isArray(sldIdLst) ? sldIdLst : [sldIdLst];
  return arr.map((s: any) => s["@_r:id"]).filter(Boolean);
}

function buildRelMap(rels: any): Record<string, string> {
  const map: Record<string, string> = {};
  const relsList =
    rels?.["Relationships"]?.["Relationship"];
  if (!relsList) return map;
  const arr = Array.isArray(relsList) ? relsList : [relsList];
  for (const r of arr) {
    if (r["@_Id"] && r["@_Target"]) {
      map[r["@_Id"]] = r["@_Target"];
    }
  }
  return map;
}

function resolveRelPath(basePath: string, relTarget: string): string {
  const dir = basePath.substring(0, basePath.lastIndexOf("/"));
  // Handle relative paths like "../notesSlides/notesSlide1.xml"
  const parts = `${dir}/${relTarget}`.split("/");
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === "..") resolved.pop();
    else if (p !== ".") resolved.push(p);
  }
  return resolved.join("/");
}

async function processSlide(
  slide: any,
  relMap: Record<string, string>,
  zip: JSZip,
  slidePath: string,
  options?: ConvertOptions,
): Promise<string> {
  const spTree =
    slide?.["p:sld"]?.["p:cSld"]?.["p:spTree"];
  if (!spTree) return "";

  const shapes = collectShapes(spTree);

  // Sort by position: top-to-bottom, then left-to-right
  shapes.sort((a, b) => {
    const dy = (a.y ?? 0) - (b.y ?? 0);
    if (Math.abs(dy) > 50000) return dy; // ~0.5 inch threshold
    return (a.x ?? 0) - (b.x ?? 0);
  });

  const parts: string[] = [];

  for (const shape of shapes) {
    if (shape.type === "title") {
      parts.push(`# ${shape.text}`);
    } else if (shape.type === "text") {
      parts.push(shape.text);
    } else if (shape.type === "table") {
      parts.push(shape.text);
    } else if (shape.type === "image") {
      const imgRef = shape.relId ? relMap[shape.relId] : undefined;
      const alt = shape.text || "";
      if (imgRef && !imgRef.startsWith("http")) {
        const imgPath = resolveRelPath(slidePath, imgRef);
        const imgFile = zip.file(imgPath);
        if (imgFile && options?.keepDataUris) {
          const imgData = await imgFile.async("base64");
          const ext = imgRef.split(".").pop() ?? "png";
          const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
          parts.push(`![${alt}](data:${mime};base64,${imgData})`);
        } else {
          const filename = imgRef.split("/").pop() ?? imgRef;
          parts.push(`![${alt}](${filename})`);
        }
      } else if (imgRef) {
        parts.push(`![${alt}](${imgRef})`);
      }
    } else if (shape.type === "chart") {
      parts.push(shape.text);
    }
  }

  return parts.join("\n\n");
}

interface ShapeInfo {
  type: "title" | "text" | "table" | "image" | "chart";
  text: string;
  x?: number;
  y?: number;
  relId?: string;
}

function collectShapes(spTree: any): ShapeInfo[] {
  const shapes: ShapeInfo[] = [];

  // Regular shapes (p:sp)
  const spList = asArray(spTree["p:sp"]);
  for (const sp of spList) {
    const pos = getPosition(sp);
    const isTitle = isPlaceholderTitle(sp);
    const text = extractShapeText(sp);
    if (text.trim()) {
      shapes.push({
        type: isTitle ? "title" : "text",
        text: text.trim(),
        ...pos,
      });
    }
  }

  // Pictures (p:pic)
  const picList = asArray(spTree["p:pic"]);
  for (const pic of picList) {
    const pos = getPosition(pic);
    const alt = pic?.["p:nvPicPr"]?.["p:cNvPr"]?.["@_descr"] ??
      pic?.["p:nvPicPr"]?.["p:cNvPr"]?.["@_name"] ?? "";
    const relId =
      pic?.["p:blipFill"]?.["a:blip"]?.["@_r:embed"] ?? undefined;
    shapes.push({
      type: "image",
      text: alt,
      relId,
      ...pos,
    });
  }

  // Tables / Charts (p:graphicFrame)
  const gfList = asArray(spTree["p:graphicFrame"]);
  for (const gf of gfList) {
    const pos = getPosition(gf);
    const table = gf?.["a:graphic"]?.["a:graphicData"]?.["a:tbl"];
    if (table) {
      shapes.push({
        type: "table",
        text: convertPptxTable(table),
        ...pos,
      });
      continue;
    }

    // Chart reference
    const chartRef =
      gf?.["a:graphic"]?.["a:graphicData"]?.["c:chart"]?.[
        "@_r:id"
      ];
    if (chartRef) {
      shapes.push({
        type: "chart",
        text: "", // Chart data is extracted separately if needed
        relId: chartRef,
        ...pos,
      });
    }
  }

  // Group shapes (p:grpSp) — recurse
  const grpList = asArray(spTree["p:grpSp"]);
  for (const grp of grpList) {
    shapes.push(...collectShapes(grp));
  }

  return shapes;
}

function getPosition(shape: any): { x?: number; y?: number } {
  const off =
    shape?.["p:spPr"]?.["a:xfrm"]?.["a:off"] ??
    shape?.["p:grpSpPr"]?.["a:xfrm"]?.["a:off"] ??
    shape?.["p:xfrm"]?.["a:off"];
  if (!off) return {};
  return {
    x: Number(off["@_x"]) || 0,
    y: Number(off["@_y"]) || 0,
  };
}

function isPlaceholderTitle(sp: any): boolean {
  const ph =
    sp?.["p:nvSpPr"]?.["p:nvPr"]?.["p:ph"];
  if (!ph) return false;
  const type = ph["@_type"] ?? "";
  return type === "title" || type === "ctrTitle";
}

function extractShapeText(sp: any): string {
  const txBody = sp?.["p:txBody"];
  if (!txBody) return "";
  return extractParagraphs(txBody);
}

function extractParagraphs(txBody: any): string {
  const paragraphs = asArray(txBody?.["a:p"]);
  const lines: string[] = [];

  for (const p of paragraphs) {
    const runs = asArray(p?.["a:r"]);
    let lineText = "";
    for (const r of runs) {
      const t = r?.["a:t"];
      if (t !== undefined && t !== null) {
        lineText += String(t);
      }
    }
    // Also check for field text (a:fld)
    const fld = p?.["a:fld"];
    if (fld) {
      const flds = Array.isArray(fld) ? fld : [fld];
      for (const f of flds) {
        const t = f?.["a:t"];
        if (t !== undefined && t !== null) lineText += String(t);
      }
    }
    lines.push(lineText);
  }

  return lines.join("\n");
}

function convertPptxTable(tbl: any): string {
  const rows = asArray(tbl?.["a:tr"]);
  if (rows.length === 0) return "";

  const htmlParts: string[] = ["<table>"];

  for (let i = 0; i < rows.length; i++) {
    const cells = asArray(rows[i]?.["a:tc"]);
    const tag = i === 0 ? "th" : "td";
    if (i === 0) htmlParts.push("<thead>");
    if (i === 1) htmlParts.push("<tbody>");
    htmlParts.push("<tr>");
    for (const cell of cells) {
      const text = extractParagraphs(cell?.["a:txBody"]);
      htmlParts.push(`<${tag}>${escapeHtml(text)}</${tag}>`);
    }
    htmlParts.push("</tr>");
    if (i === 0) htmlParts.push("</thead>");
  }

  htmlParts.push("</tbody></table>");

  const { markdown } = convertHtmlString(htmlParts.join(""));
  return markdown;
}

function extractAllText(obj: any): string {
  if (typeof obj === "string") return obj;
  if (typeof obj !== "object" || obj === null) return "";
  if (obj["a:t"] !== undefined) return String(obj["a:t"]);

  const parts: string[] = [];
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        parts.push(extractAllText(item));
      }
    } else {
      parts.push(extractAllText(val));
    }
  }
  return parts.filter(Boolean).join("\n");
}

function asArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
