import { on, showUI, emit } from '@create-figma-plugin/utilities';
import { TableData, TableStyle } from '../shared/types';

interface ColConfig {
  hAlign: 'left' | 'center' | 'right' | 'justify';
  vAlign: 'top' | 'middle' | 'bottom';
}


// Bootstrap


export default function () {
  showUI({ width: 320, height: 520 });

  scanSelection();
  figma.on('selectionchange', scanSelection);

  // ── Table ──────────────────────────────────────────────

  on('create-table', async (msg: { data: TableData; style: TableStyle; colConfigs?: ColConfig[] }) => {
    await loadFonts(msg.style);
    const table = buildTable(msg.data, msg.style, msg.colConfigs || []);
    const vp = figma.viewport.center;
    table.x = Math.round(vp.x - table.width / 2);
    table.y = Math.round(vp.y - table.height / 2);
    figma.currentPage.appendChild(table);
    figma.currentPage.selection = [table];
    figma.viewport.scrollAndZoomIntoView([table]);
    emit('table-created', {});
    figma.notify('✓ Table created');
  });

  on('restyle-table', async (msg: { style: TableStyle }) => {
    const sel = figma.currentPage.selection;
    if (sel.length !== 1 || sel[0].type !== 'FRAME' || sel[0].name !== 'Tablo') {
      figma.notify('Select a Tablo table to restyle');
      return;
    }
    await loadFonts(msg.style);
    restyleTable(sel[0] as FrameNode, msg.style);
    figma.notify('✓ Restyled');
  });

  // ── Export ─────────────────────────────────────────────

  on('export-csv', (msg: { data: TableData }) => {
    emit('export-ready', { format: 'csv', content: toCSV(msg.data) });
  });

  on('export-json', (msg: { data: TableData }) => {
    emit('export-ready', { format: 'json', content: toJSON(msg.data) });
  });

  // ── Import ─────────────────────────────────────────────

  on('fetch-sheet', async (msg: { url: string }) => {
    const result = await fetchSpreadsheet(msg.url);
    if (result.ok) {
      emit('sheet-loaded', { csv: result.csv });
    } else {
      const msg2: Record<string, string> = {
        'invalid-url': 'Paste a Google Sheets or Excel Online share URL.',
        'private':     'File is private. Set sharing to "Anyone with the link can view".',
        'network':     'Network error. Check manifest.json has networkAccess configured.',
        'empty':       'File loaded but is empty. Check the correct tab is active.',
        'unsupported': 'Binary Excel files (.xlsx) can\'t be parsed here. Save as CSV in Excel first, or use Google Sheets.',
      };
      emit('sheet-error', { message: msg2[result.reason] ?? 'Could not load file.' });
    }
  });
}


// Selection scanner


function scanSelection() {
  const sel = figma.currentPage.selection;

  if (sel.length === 0) {
    emit('selection-cleared', {});
    return;
  }

  if (sel.length === 1 && sel[0].type === 'FRAME' && sel[0].name === 'Tablo') {
    emit('tablo-selected', {});
    return;
  }

  // Gather text from selected nodes - scattered text → table
  const texts: string[] = [];
  const walk = (node: SceneNode) => {
    if (node.type === 'TEXT') texts.push(node.characters.trim());
    if ('children' in node) (node.children as SceneNode[]).forEach(walk);
  };
  sel.forEach(walk);

  if (texts.length > 0) {
    // Join with tabs so the TSV parser picks it up cleanly
    emit('selection-text', { text: texts.join('\t') });
  }
}


// Fonts


async function loadFonts(s: TableStyle) {
  const family = s.fontFamily || 'Inter';
  try {
    await figma.loadFontAsync({ family, style: 'Regular' });
    await figma.loadFontAsync({ family, style: 'Bold' });
  } catch {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  }
}


// Column width - measure every cell, no dumb truncation


const COL_MIN = 64;
const COL_MAX = 280;
const COL_PAD = 28;

function measureText(text: string, size: number, family: string, bold: boolean): number {
  const t = figma.createText();
  t.fontName = { family: family || 'Inter', style: bold ? 'Bold' : 'Regular' };
  t.fontSize = size;
  t.characters = text || '-';
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  const w = t.width;
  t.remove();
  return w;
}

function calcWidths(data: TableData, s: TableStyle): number[] {
  const family = s.fontFamily || 'Inter';
  const widths: number[] = [];

  for (let c = 0; c < data.headers.length; c++) {
    let max = measureText(data.headers[c] || `Col${c + 1}`, s.fontSize, family, s.headerBold);
    for (const row of data.rows) {
      const w = measureText(row[c] || '', s.fontSize, family, false);
      if (w > max) max = w;
    }
    widths.push(Math.min(COL_MAX, Math.max(COL_MIN, Math.ceil(max + COL_PAD))));
  }

  // Stretch narrow tables
  const total = widths.reduce((a, b) => a + b, 0);
  if (total < 480 && data.headers.length <= 6) {
    const ratio = 480 / total;
    for (let i = 0; i < widths.length; i++) {
      widths[i] = Math.min(COL_MAX, Math.ceil(widths[i] * ratio));
    }
  }

  return widths;
}


// Table builder


function buildTable(data: TableData, s: TableStyle, colConfigs: ColConfig[]): FrameNode {
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
  row.fills = [{
    type: 'SOLID',
    color: hex(isHead ? s.headerBg : isZebra ? s.zebraColor : '#FFFFFF'),
  }];

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
    const hAlign = cfg ? (cfg.hAlign === 'justify' ? 'left' : cfg.hAlign) : (s.columnAlignment[c] || 'left');
    const vAlign = cfg?.vAlign || 'middle';
    row.appendChild(buildCell(
      cells[c] || '',
      widths[c],
      s,
      isHead,
      hAlign,
      vAlign,
      isHead ? (cells[c] || `Col${c + 1}`) : `R${idx + 1}·C${c + 1}`,
    ));
  }

  return row;
}

function buildCell(
  text: string,
  w: number,
  s: TableStyle,
  isHead: boolean,
  hAlign: string,
  vAlign: string,
  name: string,
): FrameNode {
  const raw = text.trim() || (isHead ? '' : '-');
  // Safety cap at 80 chars - column is already sized to fit real content
  const display = raw.length > 80 ? raw.slice(0, 77) + '…' : raw;

  const cell = figma.createFrame();
  cell.name = name;
  cell.layoutMode = 'HORIZONTAL';
  cell.resize(w, s.rowHeight || 36);
  cell.paddingLeft = s.cellPaddingX || 12;
  cell.paddingRight = s.cellPaddingX || 12;
  cell.paddingTop = s.cellPaddingY || 8;
  cell.paddingBottom = s.cellPaddingY || 8;
  cell.fills = [];
  cell.primaryAxisAlignItems = hAlign === 'right' ? 'MAX' : hAlign === 'center' ? 'CENTER' : 'MIN';
  cell.counterAxisAlignItems = vAlign === 'top' ? 'MIN' : vAlign === 'bottom' ? 'MAX' : 'CENTER';

  const t = figma.createText();
  t.characters = display || (isHead ? name : '-');
  t.fontSize = s.fontSize;
  t.fontName = { family: s.fontFamily || 'Inter', style: isHead && s.headerBold ? 'Bold' : 'Regular' };
  t.fills = [{ type: 'SOLID', color: hex(isHead ? s.headerTextColor : '#2c2c2c') }];
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  cell.appendChild(t);

  cell.layoutSizingHorizontal = 'FIXED';
  cell.layoutSizingVertical = 'HUG';
  t.layoutSizingHorizontal = 'FILL';
  t.layoutSizingVertical = 'HUG';

  return cell;
}


// Restyle existing table


function restyleTable(table: FrameNode, s: TableStyle) {
  table.strokes = s.borderEnabled
    ? [{ type: 'SOLID', color: hex(s.borderColor) }]
    : [];
  if (s.borderEnabled) table.strokeWeight = 1;

  table.children.forEach((row, ri) => {
    if (row.type !== 'FRAME') return;
    const isHead = ri === 0;
    const isZebra = !isHead && s.zebraRows && (ri - 1) % 2 === 1;

    (row as FrameNode).fills = [{
      type: 'SOLID',
      color: hex(isHead ? s.headerBg : isZebra ? s.zebraColor : '#FFFFFF'),
    }];

    if (s.borderEnabled) {
      (row as FrameNode).strokes = [{ type: 'SOLID', color: hex(s.borderColor) }];
      (row as FrameNode).strokeAlign = 'INSIDE';
      (row as FrameNode).strokeTopWeight = 0;
      (row as FrameNode).strokeRightWeight = 0;
      (row as FrameNode).strokeLeftWeight = 0;
      (row as FrameNode).strokeBottomWeight = isHead ? 1.5 : 0.5;
    } else {
      (row as FrameNode).strokes = [];
    }

    (row as FrameNode).children.forEach(cell => {
      if (cell.type !== 'FRAME') return;
      (cell as FrameNode).children.forEach(child => {
        if (child.type !== 'TEXT') return;
        try {
          child.fontName = { family: s.fontFamily || 'Inter', style: isHead && s.headerBold ? 'Bold' : 'Regular' };
          child.fontSize = s.fontSize;
          child.fills = [{ type: 'SOLID', color: hex(isHead ? s.headerTextColor : '#2c2c2c') }];
        } catch { /* font not loaded */ }
      });
    });
  });
}


// Export


function escapeCSV(v: string): string {
  return v.includes(',') || v.includes('"') || v.includes('\n')
    ? `"${v.replace(/"/g, '""')}"`
    : v;
}

function toCSV(data: TableData): string {
  return [
    data.headers.map(escapeCSV).join(','),
    ...data.rows.map(r => r.map(escapeCSV).join(',')),
  ].join('\n');
}

function toJSON(data: TableData): string {
  return JSON.stringify(
    data.rows.map(row => {
      const obj: Record<string, string> = {};
      data.headers.forEach((h, i) => { obj[h || `col${i}`] = row[i] || ''; });
      return obj;
    }),
    null, 2,
  );
}


// Spreadsheet import - Google Sheets + Excel Online

type SheetResult =
  | { ok: true; csv: string }
  | { ok: false; reason: 'invalid-url' | 'private' | 'network' | 'empty' | 'unsupported' };

async function fetchSpreadsheet(url: string): Promise<SheetResult> {
  const u = url.trim();
  if (!u) return { ok: false, reason: 'invalid-url' };

  if (u.includes('docs.google.com/spreadsheets')) return fetchGoogleSheet(u);
  if (u.includes('onedrive.live.com') || u.includes('1drv.ms') || u.includes('sharepoint.com')) return fetchExcelOnline(u);
  return { ok: false, reason: 'invalid-url' };
}

async function fetchGoogleSheet(url: string): Promise<SheetResult> {
  const id = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
  if (!id) return { ok: false, reason: 'invalid-url' };
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? '0';
  return doFetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
}

async function fetchExcelOnline(url: string): Promise<SheetResult> {
  // OneDrive / SharePoint: append ?download=1 or convert /edit → /download
  let dlUrl = url;
  if (url.includes('onedrive.live.com')) {
    dlUrl = url.replace('/edit', '/download').replace('/view', '/download');
  }
  if (!dlUrl.includes('/download') && !dlUrl.includes('download=1')) {
    dlUrl = dlUrl.includes('?') ? `${dlUrl}&download=1` : `${dlUrl}?download=1`;
  }
  return doFetch(dlUrl);
}

async function doFetch(url: string): Promise<SheetResult> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, reason: res.status === 401 || res.status === 403 ? 'private' : 'network' };

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('spreadsheetml') || ct.includes('officedocument') || ct.includes('octet-stream')) {
      return { ok: false, reason: 'unsupported' };
    }

    const text = await res.text();
    if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
      return { ok: false, reason: 'private' };
    }
    if (!text.trim()) return { ok: false, reason: 'empty' };

    return { ok: true, csv: text };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// Hex

function hex(h: string): { r: number; g: number; b: number } {
  const n = parseInt(h.replace('#', ''), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}