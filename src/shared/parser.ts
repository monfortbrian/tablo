import { TableData, ColumnType } from './types';

// ── Format Detection ─────────────────────────────────────────

type Fmt = 'csv' | 'tsv' | 'markdown' | 'spaces' | 'blob' | 'unknown';

function detectFormat(raw: string): Fmt {
  const lines = raw
    .trim()
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length < 1) return 'unknown';

  // Markdown: has | separators
  if (lines[0].includes('|') && lines.length > 1) {
    const sep = lines[1].trim();
    if (/^[\s|:-]+$/.test(sep)) return 'markdown';
    if (lines.every((l) => l.includes('|'))) return 'markdown';
  }

  // TSV: tabs in most lines
  const tabLines = lines.filter((l) => l.includes('\t'));
  if (tabLines.length > lines.length * 0.6) return 'tsv';

  // Multi-space: 3+ spaces as delimiters
  const spaceLines = lines.filter((l) => /\s{3,}/.test(l));
  if (spaceLines.length > lines.length * 0.6) {
    const spaceCols = lines.map(
      (l) => l.split(/\s{3,}/).filter((c) => c.trim()).length,
    );
    const first = spaceCols[0];
    const ok = spaceCols.filter((c) => c === first).length > lines.length * 0.5;
    if (ok && first >= 2) return 'spaces';
  }

  // CSV: commas in most lines with consistent count
  const commaLines = lines.filter((l) => l.includes(','));
  if (commaLines.length > lines.length * 0.6) {
    const counts = lines.map((l) => (l.match(/,/g) || []).length);
    const mode =
      counts
        .sort(
          (a, b) =>
            counts.filter((v) => v === a).length -
            counts.filter((v) => v === b).length,
        )
        .pop() || 0;
    if (mode >= 1) return 'csv';
  }

  // Blob: no clear delimiters but contains recognizable patterns
  // Check if the text has date patterns, email patterns, or number patterns mashed together
  const fullText = lines.join(' ');
  const hasDatePattern = /\d{4}-\d{2}-\d{2}/.test(fullText);
  const hasEmailPattern =
    /<[^>]+@[^>]+>/.test(fullText) || /\S+@\S+\.\S+/.test(fullText);
  const hasUUID = /[0-9a-f]{16,}/.test(fullText);
  const hasNumbers = /\$[\d,]+/.test(fullText) || /\d{3,}/.test(fullText);

  if ((hasDatePattern || hasEmailPattern || hasUUID) && lines.length <= 2) {
    return 'blob';
  }
  if (
    hasNumbers &&
    !fullText.includes('\t') &&
    !fullText.includes(',') &&
    lines.length <= 3
  ) {
    return 'blob';
  }

  return 'unknown';
}

// ── Parsers ──────────────────────────────────────────────────

function parseCSV(raw: string): string[][] {
  return raw
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const cells: string[] = [];
      let cur = '',
        inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
          cells.push(cur.trim());
          cur = '';
        } else cur += ch;
      }
      cells.push(cur.trim());
      return cells;
    });
}

function parseTSV(raw: string): string[][] {
  return raw
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('\t').map((c) => c.trim()));
}

function parseMD(raw: string): string[][] {
  return raw
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .filter((l) => !/^[\s|:-]+$/.test(l.trim()))
    .map((l) =>
      l
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
    );
}

function parseSpaces(raw: string): string[][] {
  return raw
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .map((l) =>
      l
        .split(/\s{3,}/)
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
    );
}

// ── Smart Blob Parser ────────────────────────────────────────
// Attempts to split mashed-together data by detecting patterns

function parseBlob(raw: string): string[][] | null {
  const text = raw.trim();

  // Strategy 1: Split by date patterns (YYYY-MM-DD HH:MM:SS)
  const dateRegex = /(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}:\d{2})/g;
  const dates = text.match(dateRegex);

  if (dates && dates.length >= 2) {
    // Split text around dates to find IDs and values
    const parts = text.split(dateRegex).filter((s) => s.trim());

    // Try to reconstruct rows: [id, date, rest]
    const rows: string[][] = [];
    let i = 0;
    while (i < parts.length) {
      const chunk = parts[i].trim();
      if (dateRegex.test(chunk)) {
        // This is a date, attach to previous row
        if (rows.length > 0) {
          rows[rows.length - 1].push(chunk);
        }
        i++;
      } else {
        // This is non-date content
        // Check if next part is a date
        if (i + 1 < parts.length && dateRegex.test(parts[i + 1].trim())) {
          rows.push([chunk, parts[i + 1].trim()]);
          i += 2;
          // Check if there's remaining content (like email/name)
          if (i < parts.length && !dateRegex.test(parts[i].trim())) {
            rows[rows.length - 1].push(parts[i].trim());
            i++;
          }
        } else {
          // Append to previous row or start new
          if (rows.length > 0) {
            rows[rows.length - 1].push(chunk);
          } else {
            rows.push([chunk]);
          }
          i++;
        }
      }
    }

    if (rows.length >= 2 && rows[0].length >= 2) {
      // Check if first row looks like headers
      const firstRow = rows[0];
      const looksLikeHeader = firstRow.every(
        (cell) =>
          cell.length < 30 &&
          !/\d{4}-\d{2}-\d{2}/.test(cell) &&
          !/\d{10,}/.test(cell),
      );

      if (looksLikeHeader) {
        return rows;
      }

      // Generate headers based on detected patterns
      const headers: string[] = [];
      for (const cell of rows[0]) {
        if (/\d{4}-\d{2}-\d{2}/.test(cell)) headers.push('Date');
        else if (/@/.test(cell)) headers.push('Email');
        else if (/^[0-9a-f]{10,}$/.test(cell)) headers.push('ID');
        else if (/\$/.test(cell)) headers.push('Amount');
        else headers.push(`Column ${headers.length + 1}`);
      }
      return [headers, ...rows];
    }
  }

  // Strategy 2: Split by email-like patterns
  const emailRegex = /("[^"]*"\s*<[^>]+>|[^\s<]+@[^\s>]+)/g;
  const emails = text.match(emailRegex);

  if (emails && emails.length >= 2) {
    // There are multiple email-like entries, try splitting
    const chunks = text.split(emailRegex).filter((s) => s.trim());
    if (chunks.length > emails.length) {
      // Reconstruct
      const rows: string[][] = [];
      let emailIdx = 0;
      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j].trim();
        if (emailRegex.test(chunk)) {
          if (rows.length > 0) rows[rows.length - 1].push(chunk);
          emailIdx++;
        } else {
          // Split non-email chunks by date or whitespace patterns
          const subParts = chunk
            .split(/(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}:\d{2})/)
            .filter((s) => s.trim());
          if (subParts.length >= 2) {
            rows.push(subParts);
          } else if (subParts.length === 1) {
            rows.push([subParts[0]]);
          }
        }
      }
      if (rows.length >= 2) return rows;
    }
  }

  // Strategy 3: Split by $ amounts
  const moneyRegex = /(\$[\d,]+(?:\.?\d*)?(?:\s*[-–]\s*\$[\d,]+(?:\.?\d*)?)?)/g;
  const moneyMatches = text.match(moneyRegex);

  if (moneyMatches && moneyMatches.length >= 3) {
    const parts = text.split(moneyRegex).filter((s) => s.trim());
    // Try to pair numbers with values
    const rows: string[][] = [];
    let row: string[] = [];
    for (const part of parts) {
      row.push(part.trim());
      if (moneyRegex.test(part) && row.length >= 2) {
        // Check if we should start a new row
        // Heuristic: if row has 3+ items, it might be a complete row
      }
    }
    // This is complex, fall through to LLM
  }

  return null; // Could not parse - needs LLM
}

// ── Column Type Inference ────────────────────────────────────

const CUR = /^[\$€£¥₹₿][\d,]+\.?\d*$|^[\d,]+\.?\d*\s*[\$€£¥₹₿]$/;
const PCT = /^[\d.]+%$/;
const NUM = /^-?[\d,]+\.?\d*$/;
const RNG = /^[\$€£¥]?[\d,.]+\s*[---]\s*[\$€£¥]?[\d,.]+/;
const DTE = /^\d{4}-\d{2}-\d{2}|^\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}$/;

function inferType(vals: string[]): ColumnType {
  const d = vals.slice(1).filter((v) => v.length > 0);
  if (d.length === 0) return 'text';
  let n = 0,
    c = 0,
    p = 0,
    dt = 0;
  for (const v of d) {
    if (CUR.test(v) || RNG.test(v)) c++;
    else if (PCT.test(v)) p++;
    else if (NUM.test(v)) n++;
    else if (DTE.test(v)) dt++;
  }
  const t = d.length,
    th = 0.5;
  if (c / t >= th) return 'currency';
  if (p / t >= th) return 'percentage';
  if (n / t >= th) return 'number';
  if (dt / t >= th) return 'date';
  return 'text';
}

// ── Main Parse Function ──────────────────────────────────────

export function parseInput(raw: string): TableData | null {
  if (!raw || !raw.trim()) return null;

  const fmt = detectFormat(raw);
  let grid: string[][] | null = null;

  switch (fmt) {
    case 'csv':
      grid = parseCSV(raw);
      break;
    case 'tsv':
      grid = parseTSV(raw);
      break;
    case 'markdown':
      grid = parseMD(raw);
      break;
    case 'spaces':
      grid = parseSpaces(raw);
      break;
    case 'blob':
      grid = parseBlob(raw);
      break;
    default:
      // Fallback chain: TSV → CSV → Spaces → Blob
      grid = parseTSV(raw);
      if (!grid || grid[0]?.length <= 1) grid = parseCSV(raw);
      if (!grid || grid[0]?.length <= 1) grid = parseSpaces(raw);
      if (!grid || grid[0]?.length <= 1) grid = parseBlob(raw);
      break;
  }

  if (!grid || grid.length < 2 || grid[0].length < 2) return null;

  // Normalize columns
  const maxC = Math.max(...grid.map((r) => r.length));
  const norm = grid.map((r) => {
    while (r.length < maxC) r.push('');
    return r.slice(0, maxC);
  });

  const headers = norm[0];
  const rows = norm.slice(1);
  const columnTypes: ColumnType[] = [];
  for (let col = 0; col < maxC; col++) {
    columnTypes.push(inferType(norm.map((r) => r[col])));
  }

  return { headers, rows, columnTypes };
}

// ── LLM-powered Parse (called from UI side) ──────────────────
// This function is exported for use in the UI when regex fails

export function buildLLMPrompt(raw: string): string {
  return `You are a data parser. The following text contains table data that has been mashed together with no delimiters. Detect the column structure by identifying patterns like IDs, dates, emails, numbers, currencies, and names. Return ONLY a valid CSV with headers as the first row. No explanation, no markdown, just raw CSV.

Data:
${raw}

CSV:`;
}

export function getAlignmentForType(
  type: ColumnType,
): 'left' | 'center' | 'right' {
  switch (type) {
    case 'number':
    case 'currency':
    case 'percentage':
      return 'right';
    case 'date':
      return 'center';
    default:
      return 'left';
  }
}
