import { on, showUI, emit } from '@create-figma-plugin/utilities';
import { TableData, TableStyle } from '../shared/types';

export default function () {
  showUI({ width: 320, height: 520 });

  const sel = figma.currentPage.selection;
  if (sel.length > 0) {
    const texts: string[] = [];
    const walk = (node: SceneNode): void => {
      if (node.type === 'TEXT') texts.push(node.characters);
      if ('children' in node) for (const c of node.children) walk(c as SceneNode);
    };
    for (const n of sel) walk(n);
    if (texts.length > 0) emit('selection-text', { text: texts.join('\n') });
    if (sel.length === 1 && sel[0].type === 'FRAME' && sel[0].name === 'Tablo') {
      emit('tablo-selected', { id: sel[0].id });
    }
  }

  on('create-table', async (msg: { data: TableData; style: TableStyle }) => {
    await loadFonts(msg.style);
    const table = await buildTable(msg.data, msg.style);
    const vp = figma.viewport.center;
    table.x = Math.round(vp.x - table.width / 2);
    table.y = Math.round(vp.y - table.height / 2);
    figma.currentPage.appendChild(table);
    figma.currentPage.selection = [table];
    figma.viewport.scrollAndZoomIntoView([table]);
    emit('table-created', { success: true });
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
    figma.notify('✓ Table restyled');
  });

  on('notify', (msg: { message: string }) => figma.notify(msg.message));
}

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

function measureText(text: string, fontSize: number, fontFamily: string, bold: boolean): number {
  const t = figma.createText();
  t.fontName = { family: fontFamily || 'Inter', style: bold ? 'Bold' : 'Regular' };
  t.fontSize = fontSize;
  t.characters = text || '-';
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  const w = t.width;
  t.remove();
  return w;
}

function calcWidths(data: TableData, s: TableStyle): number[] {
  const cols = data.headers.length;
  const pad = 12 * 2; // 12px left + 12px right
  const font = s.fontFamily || 'Inter';

  const widths: number[] = [];
  for (let c = 0; c < cols; c++) {
    let maxW = 0;

    // Measure DATA rows only (not header) to determine column width
    for (let r = 0; r < data.rows.length; r++) {
      const raw = data.rows[r][c] || '-';
      const txt = raw.length > 40 ? raw.slice(0, 37) + '...' : raw;
      const w = measureText(txt, s.fontSize, font, false);
      if (w > maxW) maxW = w;
    }

    // Also check header but don't let short headers shrink columns
    const headerW = measureText(data.headers[c] || '-', s.fontSize, font, s.headerBold);
    if (headerW > maxW) maxW = headerW;

    widths.push(Math.min(220, Math.max(60, Math.ceil(maxW + pad + 8))));
  }

  // Stretch small tables
  const total = widths.reduce((a, b) => a + b, 0);
  if (total < 560 && cols <= 8) {
    const ratio = 560 / total;
    for (let i = 0; i < widths.length; i++) {
      widths[i] = Math.min(220, Math.ceil(widths[i] * ratio));
    }
  }

  return widths;
}

async function buildTable(data: TableData, s: TableStyle): Promise<FrameNode> {
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

  table.appendChild(buildRow(data.headers, widths, s, -1));
  for (let i = 0; i < data.rows.length; i++) {
    table.appendChild(buildRow(data.rows[i], widths, s, i));
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

function buildRow(cells: string[], widths: number[], s: TableStyle, idx: number): FrameNode {
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
    row.appendChild(buildCell(
      cells[c] || '-', widths[c], s, isHead,
      s.columnAlignment[c] || 'left',
      isHead ? (cells[c] || `Col${c + 1}`) : `R${idx + 1}·C${c + 1}`
    ));
  }

  return row;
}

function buildCell(text: string, w: number, s: TableStyle, isHead: boolean, align: string, name: string): FrameNode {
  const val = text.trim() || '-';
  const shouldTruncate = val.length > 40;

  const cell = figma.createFrame();
  cell.name = name;
  cell.layoutMode = 'HORIZONTAL';
  cell.resize(w, 36);
  cell.paddingLeft = 12;
  cell.paddingRight = 12;
  cell.paddingTop = 8;
  cell.paddingBottom = 8;
  cell.fills = [];
  cell.primaryAxisAlignItems = 'MIN';
  cell.counterAxisAlignItems = 'CENTER';

  const t = figma.createText();
  t.characters = shouldTruncate ? val.slice(0, 37) + '...' : val;
  t.fontSize = s.fontSize;
  t.fontName = { family: s.fontFamily || 'Inter', style: isHead && s.headerBold ? 'Bold' : 'Regular' };
  t.fills = [{ type: 'SOLID', color: isHead ? hex(s.headerTextColor) : hex('#2c2c2c') }];
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  cell.appendChild(t);

  cell.layoutSizingHorizontal = 'FIXED';
  cell.layoutSizingVertical = 'HUG';
  t.layoutSizingHorizontal = 'FILL';
  t.layoutSizingVertical = 'FIXED';
  t.resize(t.width, s.fontSize * 1.4);

  return cell;
}

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
          child.fontName = { family: s.fontFamily || 'Inter', style: isHead && s.headerBold ? 'Bold' : 'Regular' };
          child.fontSize = s.fontSize;
          child.fills = [{ type: 'SOLID', color: isHead ? hex(s.headerTextColor) : hex('#2c2c2c') }];
        } catch { /* font not loaded */ }
      }
    }
  }
}

function hex(h: string): { r: number; g: number; b: number } {
  const v = h.replace('#', '');
  const n = parseInt(v, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}