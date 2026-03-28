import { on, showUI, emit } from '@create-figma-plugin/utilities';
import { TableData, TableStyle } from '../shared/types';

interface ColConfig {
  hAlign: 'left' | 'center' | 'right' | 'justify';
  vAlign: 'top' | 'middle' | 'bottom';
}

export default function () {
  showUI({ width: 320, height: 520 });

  // ── Selection scan on open ───────────────────────────────
  scanSelection();

  figma.on('selectionchange', () => scanSelection());

  // ── Handlers ─────────────────────────────────────────────

  on(
    'create-table',
    async (msg: {
      data: TableData;
      style: TableStyle;
      colConfigs?: ColConfig[];
    }) => {
      await loadFonts(msg.style);
      const table = await buildTable(msg.data, msg.style, msg.colConfigs || []);
      const vp = figma.viewport.center;
      table.x = Math.round(vp.x - table.width / 2);
      table.y = Math.round(vp.y - table.height / 2);
      figma.currentPage.appendChild(table);
      figma.currentPage.selection = [table];
      figma.viewport.scrollAndZoomIntoView([table]);
      emit('table-created', { success: true });
      figma.notify('✓ Table created');
    },
  );

  on('restyle-table', async (msg: { style: TableStyle }) => {
    const sel = figma.currentPage.selection;
    if (
      sel.length !== 1 ||
      sel[0].type !== 'FRAME' ||
      sel[0].name !== 'Tablo'
    ) {
      figma.notify('Select a Tablo table to restyle');
      return;
    }
    await loadFonts(msg.style);
    restyleTable(sel[0] as FrameNode, msg.style);
    figma.notify('✓ Table restyled');
  });

  // ── Export ────────────────────────────────────────────────

  on('export-csv', (msg: { data: TableData }) => {
    const csv = exportCSV(msg.data);
    emit('export-ready', { format: 'csv', content: csv });
  });

  on('export-json', (msg: { data: TableData; mode: 'array' | 'tokens' }) => {
    const json =
      msg.mode === 'tokens'
        ? exportJSONTokens(msg.data)
        : exportJSONArray(msg.data);
    emit('export-ready', { format: 'json', content: json });
  });

  // ── Google Sheets fetch ───────────────────────────────────

  on('fetch-sheet', async (msg: { url: string }) => {
    const csv = await fetchGoogleSheet(msg.url);
    if (csv) {
      emit('sheet-loaded', { csv });
    } else {
      emit('sheet-error', {
        message:
          'Could not load sheet. Make sure it is published to the web or set to "Anyone with the link can view".',
      });
    }
  });

  on('notify', (msg: { message: string }) => figma.notify(msg.message));
}

// ── Selection scanner ─────────────────────────────────────

function scanSelection() {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    emit('selection-cleared', {});
    return;
  }

  // Check if it's an existing Tablo table
  if (sel.length === 1 && sel[0].type === 'FRAME' && sel[0].name === 'Tablo') {
    emit('tablo-selected', { id: sel[0].id });
    return;
  }

  // Gather all text from selected nodes - scattered text detection
  const texts: string[] = [];
  const walk = (node: SceneNode): void => {
    if (node.type === 'TEXT') texts.push(node.characters.trim());
    if ('children' in node) for (const c of node.children) walk(c as SceneNode);
  };
  for (const n of sel) walk(n);

  if (texts.length > 0) {
    emit('selection-text', { text: texts.join('\t') });
  }
}

// ── Font loader ───────────────────────────────────────────

async function loadFonts(s: TableStyle) {
  const f = s.fontFamily || 'Inter';
  try {
    await figma.loadFontAsync({ family: f, style: 'Regular' });
    await figma.loadFontAsync({ family: f, style: 'Bold' });
  } catch {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  }
}

// ── Column width calculation - NO dumb truncation ────────

function measureText(
  text: string,
  fontSize: number,
  fontFamily: string,
  bold: boolean,
): number {
  const t = figma.createText();
  t.fontName = {
    family: fontFamily || 'Inter',
    style: bold ? 'Bold' : 'Regular',
  };
  t.fontSize = fontSize;
  t.characters = text || '-';
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  const w = t.width;
  t.remove();
  return w;
}

const COL_MIN = 64;
const COL_MAX = 280;
const COL_PAD = 28; // 14px each side

function calcWidths(data: TableData, s: TableStyle): number[] {
  const font = s.fontFamily || 'Inter';
  const cols = data.headers.length;
  const widths: number[] = [];

  for (let c = 0; c < cols; c++) {
    // Start with header width
    let maxW = measureText(
      data.headers[c] || `Col${c + 1}`,
      s.fontSize,
      font,
      s.headerBold,
    );

    // Check every data cell - full content, no truncation here
    for (let r = 0; r < data.rows.length; r++) {
      const raw = data.rows[r][c] || '';
      if (!raw) continue;
      const w = measureText(raw, s.fontSize, font, false);
      if (w > maxW) maxW = w;
    }

    widths.push(
      Math.min(COL_MAX, Math.max(COL_MIN, Math.ceil(maxW + COL_PAD))),
    );
  }

  // If total width is narrow (few short columns), stretch to feel balanced
  const total = widths.reduce((a, b) => a + b, 0);
  if (total < 480 && cols <= 6) {
    const ratio = 480 / total;
    for (let i = 0; i < widths.length; i++) {
      widths[i] = Math.min(COL_MAX, Math.ceil(widths[i] * ratio));
    }
  }

  return widths;
}

// ── Table builder ─────────────────────────────────────────

async function buildTable(
  data: TableData,
  s: TableStyle,
  colConfigs: ColConfig[],
): Promise<FrameNode> {
  const widths = calcWidths(data, s);

  const table = figma.createFrame();
  table.name = 'Tablo';
  table.layoutMode = 'VERTICAL';
  table.itemSpacing = 0;
  table.fills = [{ type: 'SOLID', color: hex('#FFFFFF') }];
  table.cornerRadius = 4;
  table.clipsContent = true;

  if (s.borderEnabled) {
    table.strokes = [{ type: 'SOLID', color: hex(s.borderColor) }];
    table.strokeWeight = 1;
    table.strokeAlign = 'INSIDE';
  }

  table.appendChild(buildRow(data.headers, widths, s, -1, colConfigs));
  for (let i = 0; i < data.rows.length; i++) {
    table.appendChild(buildRow(data.rows[i], widths, s, i, colConfigs));
  }

  table.layoutSizingHorizontal = 'HUG';
  table.layoutSizingVertical = 'HUG';

  for (const child of table.children) {
    if (child.type === 'FRAME') {
      (child as FrameNode).layoutSizingHorizontal = 'HUG';
      (child as FrameNode).layoutSizingVertical = 'HUG';
    }
  }

  return table;
}

function buildRow(
  cells: string[],
  widths: number[],
  s: TableStyle,
  idx: number,
  colConfigs: ColConfig[],
): FrameNode {
  const isHead = idx === -1;
  const isZebra = !isHead && s.zebraRows && idx % 2 === 1;

  const row = figma.createFrame();
  row.name = isHead ? 'Header' : `Row ${idx + 1}`;
  row.layoutMode = 'HORIZONTAL';
  row.itemSpacing = 0;

  if (isHead) {
    row.fills = [{ type: 'SOLID', color: hex(s.headerBg) }];
  } else if (isZebra) {
    row.fills = [{ type: 'SOLID', color: hex(s.zebraColor) }];
  } else {
    row.fills = [{ type: 'SOLID', color: hex('#FFFFFF') }];
  }

  if (s.borderEnabled) {
    row.strokes = [{ type: 'SOLID', color: hex(s.borderColor) }];
    row.strokeAlign = 'INSIDE';
    row.strokeTopWeight = 0;
    row.strokeRightWeight = 0;
    row.strokeLeftWeight = 0;
    row.strokeBottomWeight = isHead ? 1.5 : 0.5;
  }

  for (let c = 0; c < cells.length; c++) {
    const cfg = colConfigs[c];
    const hAlign = cfg
      ? cfg.hAlign === 'justify'
        ? 'left'
        : cfg.hAlign
      : s.columnAlignment[c] || 'left';
    const vAlign = cfg?.vAlign || 'middle';
    row.appendChild(
      buildCell(
        cells[c] || '',
        widths[c],
        s,
        isHead,
        hAlign,
        vAlign,
        isHead ? cells[c] || `Col${c + 1}` : `R${idx + 1}·C${c + 1}`,
      ),
    );
  }

  return row;
}

function buildCell(
  text: string,
  w: number,
  s: TableStyle,
  isHead: boolean,
  align: string,
  vAlign: string,
  name: string,
): FrameNode {
  const raw = text.trim() || (isHead ? '' : '-');
  const displayText = raw.length > 80 ? raw.slice(0, 77) + '…' : raw;

  const cell = figma.createFrame();
  cell.name = name;
  cell.layoutMode = 'HORIZONTAL';
  cell.resize(w, s.rowHeight || 36);
  cell.paddingLeft = s.cellPaddingX || 12;
  cell.paddingRight = s.cellPaddingX || 12;
  cell.paddingTop = s.cellPaddingY || 8;
  cell.paddingBottom = s.cellPaddingY || 8;
  cell.fills = [];

  // Horizontal axis (primary) - text alignment
  cell.primaryAxisAlignItems =
    align === 'right' ? 'MAX' : align === 'center' ? 'CENTER' : 'MIN';

  // Vertical axis (counter)
  cell.counterAxisAlignItems =
    vAlign === 'top' ? 'MIN' : vAlign === 'bottom' ? 'MAX' : 'CENTER';

  const t = figma.createText();
  t.characters = displayText || (isHead ? name : '-');
  t.fontSize = s.fontSize;
  t.fontName = {
    family: s.fontFamily || 'Inter',
    style: isHead && s.headerBold ? 'Bold' : 'Regular',
  };
  t.fills = [
    {
      type: 'SOLID',
      color: isHead ? hex(s.headerTextColor) : hex('#2c2c2c'),
    },
  ];
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  cell.appendChild(t);

  cell.layoutSizingHorizontal = 'FIXED';
  cell.layoutSizingVertical = 'HUG';
  t.layoutSizingHorizontal = 'FILL';
  t.layoutSizingVertical = 'HUG';

  return cell;
}

// ── Restyle ───────────────────────────────────────────────

function restyleTable(table: FrameNode, s: TableStyle) {
  if (s.borderEnabled) {
    table.strokes = [{ type: 'SOLID', color: hex(s.borderColor) }];
    table.strokeWeight = 1;
  } else {
    table.strokes = [];
  }

  const rows = table.children;
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    if (row.type !== 'FRAME') continue;
    const isHead = ri === 0;
    const isZebra = !isHead && s.zebraRows && (ri - 1) % 2 === 1;

    if (isHead) {
      row.fills = [{ type: 'SOLID', color: hex(s.headerBg) }];
    } else if (isZebra) {
      row.fills = [{ type: 'SOLID', color: hex(s.zebraColor) }];
    } else {
      row.fills = [{ type: 'SOLID', color: hex('#FFFFFF') }];
    }

    if (s.borderEnabled) {
      row.strokes = [{ type: 'SOLID', color: hex(s.borderColor) }];
      row.strokeAlign = 'INSIDE';
      row.strokeTopWeight = 0;
      row.strokeRightWeight = 0;
      row.strokeLeftWeight = 0;
      row.strokeBottomWeight = isHead ? 1.5 : 0.5;
    } else {
      row.strokes = [];
    }

    for (const cell of row.children) {
      if (cell.type !== 'FRAME') continue;
      for (const child of cell.children) {
        if (child.type !== 'TEXT') continue;
        try {
          child.fontName = {
            family: s.fontFamily || 'Inter',
            style: isHead && s.headerBold ? 'Bold' : 'Regular',
          };
          child.fontSize = s.fontSize;
          child.fills = [
            {
              type: 'SOLID',
              color: isHead ? hex(s.headerTextColor) : hex('#2c2c2c'),
            },
          ];
        } catch {
          /* font not loaded */
        }
      }
    }
  }
}

// ── CSV Export ────────────────────────────────────────────

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(data: TableData): string {
  const lines: string[] = [];
  lines.push(data.headers.map(escapeCSV).join(','));
  for (const row of data.rows) {
    lines.push(row.map(escapeCSV).join(','));
  }
  return lines.join('\n');
}

// ── JSON Export ───────────────────────────────────────────

function exportJSONArray(data: TableData): string {
  const arr = data.rows.map((row) => {
    const obj: Record<string, string> = {};
    data.headers.forEach((h, i) => {
      obj[h || `col${i}`] = row[i] || '';
    });
    return obj;
  });
  return JSON.stringify(arr, null, 2);
}

function exportJSONTokens(data: TableData): string {
  // Design-token / dev-handoff format
  // Keyed by first column value, each row becomes a named object
  const tokens: Record<string, Record<string, string>> = {};
  const keyCol = data.headers[0] || 'id';

  for (const row of data.rows) {
    const key =
      (row[0] || '')
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '') || `row_${data.rows.indexOf(row)}`;
    const obj: Record<string, string> = {};
    data.headers.forEach((h, i) => {
      if (i === 0) return; // skip key column
      const prop = h
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
      obj[prop] = row[i] || '';
    });
    tokens[key] = obj;
  }

  return JSON.stringify(tokens, null, 2);
}

// ── Google Sheets fetch ───────────────────────────────────

async function fetchGoogleSheet(url: string): Promise<string | null> {
  try {
    // Extract sheet ID from various Google Sheets URL formats
    const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch) return null;

    const sheetId = idMatch[1];

    // Extract gid (tab) if present
    const gidMatch = url.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';

    // Build the export URL - works for published or "anyone with link" sheets
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const res = await fetch(exportUrl);
    if (!res.ok) return null;

    const text = await res.text();
    // Sanity check - if we got HTML back, the sheet is private
    if (
      text.trim().startsWith('<!DOCTYPE') ||
      text.trim().startsWith('<html')
    ) {
      return null;
    }

    return text;
  } catch {
    return null;
  }
}

// ── Hex helper ────────────────────────────────────────────

function hex(h: string): { r: number; g: number; b: number } {
  const v = h.replace('#', '');
  const n = parseInt(v, 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}
