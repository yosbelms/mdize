export interface PositionedWord {
  text: string;
  x0: number;
  x1: number;
  top: number;
}

export interface TableDetectorOptions {
  pageWidth: number;
  yTolerance?: number;
  columnGap?: number;
  globalColumnGap?: number;
  alignTolerance?: number;
  minTableDensity?: number;
  maxColumns?: number;
}

interface RowInfo {
  yKey: number;
  words: PositionedWord[];
  text: string;
  lineWidth: number;
  xGroups: number[];
  isParagraph: boolean;
  hasPartialNumbering: boolean;
  numColumns: number;
  isTableRow: boolean;
  alignedCount: number;
}

const PARTIAL_NUMBERING = /^\.\d+$/;

export function detectTables(
  words: PositionedWord[],
  options: TableDetectorOptions,
): string | null {
  const {
    pageWidth,
    yTolerance = 5,
    columnGap: columnGapOverride,
    globalColumnGap: globalColumnGapOverride,
    alignTolerance: alignToleranceOverride,
    minTableDensity = 0.2,
    maxColumns = 30,
  } = options;

  if (words.length === 0) return null;

  // Step 1: Group words into rows by Y position
  const rowsByY = new Map<number, PositionedWord[]>();
  for (const w of words) {
    const yKey = Math.round(w.top / yTolerance) * yTolerance;
    let row = rowsByY.get(yKey);
    if (!row) {
      row = [];
      rowsByY.set(yKey, row);
    }
    row.push(w);
  }

  // Sort each row by X and collect all inter-word gaps for adaptive thresholds
  const sortedKeys = [...rowsByY.keys()].sort((a, b) => a - b);
  const allGaps: number[] = [];

  for (const yKey of sortedKeys) {
    const rw = rowsByY.get(yKey)!.sort((a, b) => a.x0 - b.x0);
    rowsByY.set(yKey, rw);
    for (let i = 1; i < rw.length; i++) {
      const gap = rw[i].x0 - rw[i - 1].x1;
      if (gap > 0) allGaps.push(gap);
    }
  }

  // Adaptive column gap: use median inter-word gap as baseline.
  // Words within the same "cell" typically have small gaps (~2-5px),
  // while column separators have larger gaps. We use the 65th percentile
  // as the split point, with a minimum of 8px.
  let columnGap: number;
  let globalColumnGap: number;
  let alignTolerance: number;
  if (columnGapOverride !== undefined) {
    columnGap = columnGapOverride;
    globalColumnGap = globalColumnGapOverride ?? Math.max(columnGap * 0.6, 8);
    alignTolerance = alignToleranceOverride ?? columnGap * 0.8;
  } else if (allGaps.length > 0) {
    allGaps.sort((a, b) => a - b);
    const p65 = allGaps[Math.floor(allGaps.length * 0.65)];
    columnGap = Math.max(p65 * 1.2, 8);
    globalColumnGap = globalColumnGapOverride ?? Math.max(columnGap * 0.6, 6);
    alignTolerance = alignToleranceOverride ?? Math.max(columnGap * 1.5, 15);
  } else {
    columnGap = 50;
    globalColumnGap = globalColumnGapOverride ?? 30;
    alignTolerance = alignToleranceOverride ?? 40;
  }

  // Build RowInfo
  const rows: RowInfo[] = [];

  for (const yKey of sortedKeys) {
    const rowWords = rowsByY.get(yKey)!;
    const text = rowWords.map((w) => w.text).join(" ");
    const lineWidth =
      rowWords.length > 0
        ? rowWords[rowWords.length - 1].x1 - rowWords[0].x0
        : 0;

    // Step 2: Cluster X positions into column groups
    const xPositions = rowWords.map((w) => w.x0);
    const xGroups = clusterPositions(xPositions, columnGap);

    // Compute gap range to distinguish paragraphs from dense table rows.
    // Paragraphs have uniform small word gaps (range ≈ 0), while table rows
    // have varied gaps even when densely packed.
    const rowGaps: number[] = [];
    for (let j = 1; j < rowWords.length; j++) {
      const g = rowWords[j].x0 - rowWords[j - 1].x1;
      if (g > 0) rowGaps.push(g);
    }
    const gapRange =
      rowGaps.length > 1
        ? Math.max(...rowGaps) - Math.min(...rowGaps)
        : 0;
    const uniformGapThreshold = Math.max(columnGap * 0.25, 10);

    const isParagraph =
      lineWidth > pageWidth * 0.55 &&
      text.length > 60 &&
      (rowWords.length <= 2 || gapRange < uniformGapThreshold);
    const hasPartialNumbering =
      rowWords.length > 0 && PARTIAL_NUMBERING.test(rowWords[0].text);

    rows.push({
      yKey,
      words: rowWords,
      text,
      lineWidth,
      xGroups,
      isParagraph,
      hasPartialNumbering,
      numColumns: xGroups.length,
      isTableRow: false,
      alignedCount: 0,
    });
  }

  // Step 3: Detect global column structure.
  // Collect ALL word x0 positions from table-candidate rows, then use
  // frequency-based filtering to eliminate noise from header rows whose
  // positions can bridge adjacent data columns during clustering.
  const allX0s: number[] = [];
  let contributingRowCount = 0;
  for (const row of rows) {
    if (row.numColumns >= 3 && !row.isParagraph) {
      allX0s.push(...row.words.map((w) => w.x0));
      contributingRowCount++;
    }
  }

  if (allX0s.length === 0) return null;

  // Filter to x0 positions that appear frequently across rows
  // (data columns repeat in many rows; header noise appears only 1-2 times)
  const positionTolerance = Math.max(yTolerance, 5);
  const minFrequency = Math.max(Math.ceil(contributingRowCount * 0.3), 2);
  const frequentPositions = findFrequentPositions(
    allX0s,
    positionTolerance,
    minFrequency,
  );

  if (frequentPositions.length === 0) return null;

  const globalColumns = clusterPositions(frequentPositions, globalColumnGap);
  if (globalColumns.length > maxColumns) return null;

  // Step 4: Classify rows as table or non-table
  // Require more aligned words when there are many columns — with 17+
  // columns spread across the page, almost any 2-word line will
  // accidentally align with some column position.
  const minAligned = Math.max(2, Math.ceil(globalColumns.length * 0.25));
  for (const row of rows) {
    if (row.isParagraph || row.hasPartialNumbering) continue;

    let alignedCount = 0;
    for (const word of row.words) {
      for (const colX of globalColumns) {
        if (Math.abs(word.x0 - colX) < alignTolerance) {
          alignedCount++;
          break;
        }
      }
    }

    row.alignedCount = alignedCount;
    if (alignedCount >= minAligned) {
      row.isTableRow = true;
    }
  }

  // Step 4b: Fill small gaps between table regions.
  // Sparse sub-header rows (e.g. "2° CAT. L.I.R.") may have too few words
  // to pass the strict threshold but still belong to the table. Promote
  // non-table rows with ≥2 aligned words if they sit between table rows.
  if (minAligned > 2) {
    const maxGap = 3;
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      if (row.isTableRow || row.isParagraph || row.alignedCount < 2) continue;

      let tableBefore = false;
      for (let j = idx - 1; j >= Math.max(0, idx - maxGap); j--) {
        if (rows[j].isTableRow) { tableBefore = true; break; }
        if (rows[j].isParagraph) break;
      }
      if (!tableBefore) continue;

      let tableAfter = false;
      for (let j = idx + 1; j < Math.min(rows.length, idx + maxGap + 1); j++) {
        if (rows[j].isTableRow) { tableAfter = true; break; }
        if (rows[j].isParagraph) break;
      }

      if (tableAfter) {
        row.isTableRow = true;
      }
    }
  }

  // Step 5: Validate table density
  const totalRows = rows.length;
  const tableRowCount = rows.filter((r) => r.isTableRow).length;
  if (tableRowCount / totalRows < minTableDensity) return null;

  // Step 6: Find consecutive table regions and format output
  const output: string[] = [];
  let i = 0;

  while (i < rows.length) {
    if (!rows[i].isTableRow) {
      // Non-table row: plain text
      if (rows[i].text.trim()) {
        output.push(rows[i].text.trim());
      }
      i++;
      continue;
    }

    // Found start of a table region
    const regionStart = i;
    while (i < rows.length && rows[i].isTableRow) {
      i++;
    }

    // Format this table region
    const tableRows = rows.slice(regionStart, i);
    const numCols = globalColumns.length;

    const mdRows: string[][] = [];
    const colBuffer = Math.max(globalColumnGap * 0.5, 4);
    for (const row of tableRows) {
      const cells = new Array<string>(numCols).fill("");
      for (const word of row.words) {
        // Assign word to column based on range
        let assignedCol = numCols - 1;
        for (let c = 0; c < numCols - 1; c++) {
          if (word.x0 < globalColumns[c + 1] - colBuffer) {
            assignedCol = c;
            break;
          }
        }
        cells[assignedCol] =
          cells[assignedCol] ? `${cells[assignedCol]} ${word.text}` : word.text;
      }
      mdRows.push(cells);
    }

    const merged = mergeLogicalRows(mdRows);
    if (merged.length > 0) {
      // Header
      output.push("| " + merged[0].join(" | ") + " |");
      output.push("| " + merged[0].map(() => "---").join(" | ") + " |");
      for (let r = 1; r < merged.length; r++) {
        output.push("| " + merged[r].join(" | ") + " |");
      }
    }
  }

  const result = output.join("\n").trim();
  return result || null;
}

/**
 * Merge physical PDF rows into logical rows when cell content wraps
 * across multiple lines. A new physical row merges into the current
 * buffer if there is no column overlap, or if it is a sparse
 * continuation (fills fewer than half the buffer's columns).
 */
function mergeLogicalRows(mdRows: string[][]): string[][] {
  if (mdRows.length === 0) return [];

  const result: string[][] = [];
  let buffer = mdRows[0].slice();

  for (let i = 1; i < mdRows.length; i++) {
    const row = mdRows[i];
    const bufferFilled = buffer.filter((c) => c !== "").length;
    const newFilled = row.filter((c) => c !== "").length;

    let overlapCount = 0;
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== "" && buffer[c] !== "") overlapCount++;
    }

    if (overlapCount === 0 || newFilled < bufferFilled * 0.5) {
      // Merge into buffer
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== "") {
          buffer[c] = buffer[c] ? `${buffer[c]} ${row[c]}` : row[c];
        }
      }
    } else {
      // Flush buffer, start new
      result.push(buffer);
      buffer = row.slice();
    }
  }

  result.push(buffer);
  return result;
}

/**
 * Group nearby x0 positions and keep only groups with enough frequency.
 * Returns the mean position of each qualifying group.
 */
function findFrequentPositions(
  positions: number[],
  tolerance: number,
  minCount: number,
): number[] {
  if (positions.length === 0) return [];

  const sorted = [...positions].sort((a, b) => a - b);
  const groups: number[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > tolerance) {
      groups.push([sorted[i]]);
    } else {
      groups[groups.length - 1].push(sorted[i]);
    }
  }

  return groups
    .filter((g) => g.length >= minCount)
    .map((g) => g[Math.floor(g.length / 2)]); // use median for stability
}

function clusterPositions(positions: number[], gap: number): number[] {
  if (positions.length === 0) return [];

  const sorted = [...positions].sort((a, b) => a - b);
  const clusters: number[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > gap) {
      clusters.push(sorted[i]);
    }
  }

  return clusters;
}

/**
 * Post-process text to merge MasterFormat partial numbering lines.
 * Lines like ".1" followed by text on the next line get merged.
 */
export function mergeMasterFormatNumbering(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (PARTIAL_NUMBERING.test(lines[i].trim())) {
      // Look ahead for the next non-empty line
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length) {
        result.push(`${lines[i].trim()} ${lines[j].trim()}`);
        i = j; // Skip the merged line
      } else {
        result.push(lines[i]);
      }
    } else {
      result.push(lines[i]);
    }
  }

  return result.join("\n");
}
