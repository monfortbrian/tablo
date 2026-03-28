import { h } from 'preact';
import { useState, useCallback, useEffect } from 'preact/hooks';
import { emit, on } from '@create-figma-plugin/utilities';
import { parseInput, getAlignmentForType } from '../../shared/parser';
import { TableData, TableStyle, ThemeId, THEME_PRESETS } from '../../shared/types';

type Panel = 'main' | 'export' | 'import';
type HAlign = 'left' | 'center' | 'right' | 'justify';
type VAlign = 'top' | 'middle' | 'bottom';

interface ColConfig {
  hAlign: HAlign;
  vAlign: VAlign;
}

export function App() {
  const [raw, setRaw] = useState('');
  const [data, setData] = useState<TableData | null>(null);
  const [style, setStyle] = useState<TableStyle>({ ...THEME_PRESETS.minimal, columnAlignment: [] });
  const [status, setStatus] = useState<'idle' | 'created'>('idle');
  const [hasSelection, setHasSelection] = useState(false);
  const [panel, setPanel] = useState<Panel>('main');

  const [colConfigs, setColConfigs] = useState<ColConfig[]>([]);
  const [activeCol, setActiveCol] = useState<number | null>(null);

  const [exportDone, setExportDone] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [scatteredHint, setScatteredHint] = useState(false);

  const [dark, setDark] = useState(() => {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
  });

  const c = dark
    ? { bg: '#1c1c1c', sf: '#252525', bd: '#333', tx: '#d4d4d4', dm: '#666', ac: '#e0e0e0', inp: '#222' }
    : { bg: '#f7f7f7', sf: '#fff', bd: '#e4e4e4', tx: '#1a1a1a', dm: '#aaa', ac: '#1a1a1a', inp: '#fafafa' };

  useEffect(() => {
    on('selection-text', (msg: { text: string }) => {
      setScatteredHint(true);
      setRaw(msg.text);
      setTimeout(() => setScatteredHint(false), 3000);
    });
    on('tablo-selected', () => setHasSelection(true));
    on('selection-cleared', () => setHasSelection(false));
    on('table-created', () => { setStatus('created'); setTimeout(() => setStatus('idle'), 1800); });
    on('export-ready', (msg: { format: string; content: string }) => {
      try {
        const el = document.createElement('textarea');
        el.value = msg.content;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      } catch { }
      setExportDone(msg.format);
      setTimeout(() => setExportDone(null), 2000);
    });
    on('sheet-loaded', (msg: { csv: string }) => {
      setSheetLoading(false);
      setSheetError(null);
      setSheetUrl('');
      setRaw(msg.csv);
      setPanel('main');
    });
    on('sheet-error', (msg: { message: string }) => {
      setSheetLoading(false);
      setSheetError(msg.message);
    });
  }, []);

  useEffect(() => {
    if (!raw.trim()) { setData(null); setColConfigs([]); return; }
    const d = parseInput(raw);
    if (d && d.rows.length > 0) {
      setData(d);
      const aligns = d.columnTypes.map(getAlignmentForType);
      setStyle(p => ({ ...p, columnAlignment: aligns }));
      setColConfigs(aligns.map(h => ({ hAlign: h as HAlign, vAlign: 'middle' as VAlign })));
    } else {
      setData(null);
      setColConfigs([]);
    }
  }, [raw]);

  // Keep style.columnAlignment in sync with colConfigs
  useEffect(() => {
    if (colConfigs.length === 0) return;
    setStyle(p => ({
      ...p,
      columnAlignment: colConfigs.map(cfg => cfg.hAlign === 'justify' ? 'left' : cfg.hAlign),
    }));
  }, [colConfigs]);

  const create = useCallback(() => {
    if (!data) return;
    if (hasSelection) {
      emit('restyle-table', { style });
    } else {
      emit('create-table', { data, style, colConfigs });
    }
  }, [data, style, hasSelection, colConfigs]);

  const setTheme = useCallback((id: ThemeId) => {
    const next = { ...THEME_PRESETS[id], columnAlignment: style.columnAlignment };
    setStyle(next);
    if (hasSelection) emit('restyle-table', { style: next });
  }, [hasSelection, style.columnAlignment]);

  const updateColH = (col: number, h: HAlign) =>
    setColConfigs(prev => prev.map((cfg, i) => i === col ? { ...cfg, hAlign: h } : cfg));

  const updateColV = (col: number, v: VAlign) =>
    setColConfigs(prev => prev.map((cfg, i) => i === col ? { ...cfg, vAlign: v } : cfg));

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && data) create();
      if (e.key === 'Escape') setActiveCol(null);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [data, create]);

  const themes: ThemeId[] = ['minimal', 'stripe', 'notion', 'dashboard', 'brutalist'];

  const seg = (items: { label: string; on: boolean; click: () => void }[]) => (
    <div style={{ display: 'flex', borderRadius: '3px', overflow: 'hidden', border: `1px solid ${c.bd}` }}>
      {items.map((it, i) => (
        <button key={i} onClick={it.click} style={{
          flex: '1', padding: '5px 0', border: 'none',
          borderRight: i < items.length - 1 ? `1px solid ${c.bd}` : 'none',
          fontSize: '9px', fontWeight: it.on ? 600 : 400, cursor: 'pointer',
          textTransform: 'capitalize' as const,
          background: it.on ? c.ac : c.sf,
          color: it.on ? (dark ? '#1c1c1c' : '#fff') : c.dm,
        }}>{it.label}</button>
      ))}
    </div>
  );

  const tabBtn = (id: Panel, label: string) => (
    <button onClick={() => setPanel(id)} style={{
      flex: '1', padding: '6px 0', border: 'none',
      borderBottom: panel === id ? `2px solid ${c.ac}` : `2px solid transparent`,
      fontSize: '9px', fontWeight: panel === id ? 600 : 400,
      cursor: 'pointer', background: 'transparent',
      color: panel === id ? c.tx : c.dm,
    }}>{label}</button>
  );

  // SVG icons for alignment buttons
  const hAlignIcon = (type: HAlign, active: boolean) => {
    const col = active ? c.tx : c.dm;
    const w = 14; const h2 = 14;
    const lines: [number, number, number][] = // [x, y, width]
      type === 'left' ? [[1, 2, 10], [1, 5, 7], [1, 8, 9]]
        : type === 'center' ? [[1, 2, 10], [3, 5, 6], [2, 8, 8]]
          : type === 'right' ? [[1, 2, 10], [5, 5, 7], [3, 8, 9]]
            : [[1, 2, 10], [1, 5, 10], [1, 8, 10]];
    return (
      <svg width={w} height={h2} viewBox={`0 0 ${w} ${h2}`} fill="none" style={{ display: 'block' }}>
        {lines.map(([x, y, lw], idx) => (
          <rect key={idx} x={x} y={y} width={lw} height={1.2} rx={0.6} fill={col} />
        ))}
      </svg>
    );
  };

  const vAlignIcon = (type: VAlign, active: boolean) => {
    const col = active ? c.tx : c.dm;
    return (
      <svg width={14} height={14} viewBox="0 0 14 14" fill="none" style={{ display: 'block' }}>
        <rect x={2} y={1} width={10} height={12} rx={1.5} stroke={col} strokeWidth={1} fill="none" />
        {type === 'top' && <rect x={4} y={3} width={6} height={1.5} rx={0.75} fill={col} />}
        {type === 'top' && <rect x={4} y={5.5} width={6} height={1.5} rx={0.75} fill={col} />}
        {type === 'middle' && <rect x={4} y={5} width={6} height={1.5} rx={0.75} fill={col} />}
        {type === 'middle' && <rect x={4} y={7.5} width={6} height={1.5} rx={0.75} fill={col} />}
        {type === 'bottom' && <rect x={4} y={8} width={6} height={1.5} rx={0.75} fill={col} />}
        {type === 'bottom' && <rect x={4} y={10.5} width={6} height={1.5} rx={0.75} fill={col} />}
      </svg>
    );
  };

  const AlignBtn = ({
    active, icon, onClick,
  }: { active: boolean; icon: any; onClick: () => void }) => (
    <button
      onClick={onClick}
      style={{
        width: '26px', height: '26px', border: `1px solid ${active ? c.ac : c.bd}`,
        borderRadius: '3px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? (dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)') : c.sf,
        padding: '0',
      }}
    >
      {icon}
    </button>
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column' as const, height: '100%',
      fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px',
      color: c.tx, background: c.bg, overflow: 'hidden',
    }}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-thumb { background: ${c.bd}; border-radius: 2px; }
        ::-webkit-scrollbar-track { background: transparent; }
        textarea { scrollbar-width: thin; scrollbar-color: ${c.bd} transparent; }
        input:focus, textarea:focus { outline: none; border-color: ${c.ac} !important; }
        button { font-family: Inter, system-ui, sans-serif; }
        button:hover { opacity: 0.82; }
      `}</style>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px 0', gap: '4px' }}>
        <div style={{ display: 'flex', flex: 1, borderBottom: `1px solid ${c.bd}` }}>
          {tabBtn('main', 'Data')}
          {tabBtn('import', 'Sheets')}
          {tabBtn('export', 'Export')}
        </div>
        <div onClick={() => setDark(!dark)} style={{
          width: '28px', height: '16px', borderRadius: '8px', cursor: 'pointer',
          background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
          border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
          position: 'relative' as const, flexShrink: 0, marginLeft: '6px',
        }}>
          <div style={{
            width: '12px', height: '12px', borderRadius: '6px',
            background: dark ? '#e0e0e0' : '#1a1a1a',
            position: 'absolute' as const, top: '1px',
            left: dark ? '14px' : '1px', transition: 'left 0.15s',
          }} />
        </div>
      </div>

      {/* ══ MAIN ══ */}
      {panel === 'main' && (
        <>
          {scatteredHint && (
            <div style={{
              margin: '6px 10px 0', padding: '5px 8px',
              background: dark ? '#1e2e1e' : '#f2faf2',
              border: `1px solid ${dark ? '#3a5a3a' : '#b8ddb8'}`,
              borderRadius: '3px', fontSize: '9px',
              color: dark ? '#7abf7a' : '#2d6b2d',
            }}>
              ✦ Selection loaded - check preview
            </div>
          )}

          <div style={{ padding: '6px 10px 0' }}>
            <textarea
              style={{
                width: '100%', minHeight: '44px', maxHeight: '180px',
                border: `1px solid ${c.bd}`, borderRadius: '3px',
                padding: '8px 10px', fontSize: '10px',
                fontFamily: 'SF Mono, Consolas, monospace', lineHeight: '1.5',
                resize: 'vertical' as const, color: c.tx, background: c.inp,
              }}
              placeholder="Paste CSV, TSV, markdown, or tab data…"
              value={raw}
              onInput={e => setRaw((e.target as HTMLTextAreaElement).value)}
              autoFocus
            />
          </div>

          {/* Preview */}
          {data && (
            <div style={{
              padding: '6px 10px 0', flex: '1 1 auto', minHeight: '0',
              overflow: 'hidden', display: 'flex', flexDirection: 'column' as const,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '9px', fontWeight: 500, color: c.dm }}>
                  Preview · {data.headers.length} cols × {data.rows.length} rows
                  {activeCol !== null && (
                    <span style={{ color: c.tx }}> - {data.headers[activeCol] || `col ${activeCol + 1}`}</span>
                  )}
                </span>
                <span
                  style={{ fontSize: '9px', color: c.dm, cursor: 'pointer' }}
                  onClick={() => { setRaw(''); setData(null); setActiveCol(null); }}
                >clear</span>
              </div>

              {/* Table */}
              <div style={{
                overflow: 'auto', borderRadius: '3px',
                border: `1px solid ${c.bd}`, background: c.sf,
                flex: activeCol !== null ? '0 0 auto' : '1 1 auto',
                maxHeight: activeCol !== null ? '130px' : '220px',
              }}>
                <table style={{
                  width: '100%', borderCollapse: 'collapse' as const,
                  fontSize: '10px', tableLayout: 'auto' as const,
                }}>
                  <thead>
                    <tr>
                      {data.headers.map((hdr, i) => {
                        const isActive = activeCol === i;
                        return (
                          <th
                            key={i}
                            onClick={() => setActiveCol(isActive ? null : i)}
                            title="Click to configure alignment"
                            style={{
                              padding: '6px 8px', fontSize: '9px', fontWeight: 600,
                              textTransform: 'uppercase' as const, letterSpacing: '0.3px',
                              textAlign: (colConfigs[i]?.hAlign === 'justify' ? 'left' : colConfigs[i]?.hAlign || 'left') as any,
                              background: isActive
                                ? (dark ? '#3a3a3a' : '#e8e8e8')
                                : style.headerBg,
                              color: isActive ? c.tx : style.headerTextColor,
                              borderBottom: `1px solid ${c.bd}`,
                              whiteSpace: 'nowrap' as const,
                              position: 'sticky' as const, top: '0', zIndex: 1,
                              cursor: 'pointer', userSelect: 'none' as const,
                            }}
                          >
                            {hdr}{isActive ? ' ▾' : ''}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.slice(0, 6).map((r, ri) => (
                      <tr key={ri}>
                        {r.map((ce, ci) => (
                          <td
                            key={ci}
                            onClick={() => setActiveCol(activeCol === ci ? null : ci)}
                            style={{
                              padding: '5px 8px', fontSize: '10px', color: dark ? '#aaa' : '#555',
                              textAlign: (colConfigs[ci]?.hAlign === 'justify' ? 'left' : colConfigs[ci]?.hAlign || 'left') as any,
                              verticalAlign: (colConfigs[ci]?.vAlign || 'middle') as any,
                              background: activeCol === ci
                                ? (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
                                : style.zebraRows && ri % 2 === 1
                                  ? (dark ? '#2a2a2a' : style.zebraColor)
                                  : 'transparent',
                              borderBottom: style.borderEnabled ? `1px solid ${c.bd}` : 'none',
                              cursor: 'pointer',
                              // ── No clipping - let content show fully ──
                              whiteSpace: 'normal' as const,
                              wordBreak: 'break-word' as const,
                            }}
                          >{ce || '-'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.rows.length > 6 && (
                  <div style={{ textAlign: 'center', fontSize: '9px', color: c.dm, padding: '4px' }}>
                    +{data.rows.length - 6} more rows
                  </div>
                )}
              </div>

              {/* ── Column alignment panel ── */}
              {activeCol !== null && colConfigs[activeCol] && (
                <div style={{
                  marginTop: '5px', padding: '8px 10px',
                  background: dark ? '#252525' : '#fff',
                  border: `1px solid ${c.bd}`, borderRadius: '3px',
                  flexShrink: 0,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', marginBottom: '8px',
                  }}>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: c.tx }}>
                      {data.headers[activeCol] || `Col ${activeCol + 1}`}
                    </span>
                    <button
                      onClick={() => setActiveCol(null)}
                      style={{
                        border: 'none', background: 'none', cursor: 'pointer',
                        fontSize: '10px', color: c.dm, padding: '0 2px', lineHeight: 1,
                      }}
                    >✕</button>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    {/* Horizontal */}
                    <div>
                      <div style={{ fontSize: '8px', color: c.dm, marginBottom: '5px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                        Horizontal
                      </div>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        {(['left', 'center', 'right', 'justify'] as HAlign[]).map(h => (
                          <AlignBtn
                            key={h}
                            active={colConfigs[activeCol].hAlign === h}
                            icon={hAlignIcon(h, colConfigs[activeCol].hAlign === h)}
                            onClick={() => updateColH(activeCol, h)}
                          />
                        ))}
                      </div>
                    </div>

                    <div style={{ width: '1px', background: c.bd, alignSelf: 'stretch', margin: '0 2px' }} />

                    {/* Vertical */}
                    <div>
                      <div style={{ fontSize: '8px', color: c.dm, marginBottom: '5px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                        Vertical
                      </div>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        {(['top', 'middle', 'bottom'] as VAlign[]).map(v => (
                          <AlignBtn
                            key={v}
                            active={colConfigs[activeCol].vAlign === v}
                            icon={vAlignIcon(v, colConfigs[activeCol].vAlign === v)}
                            onClick={() => updateColV(activeCol, v)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Style */}
          {data && (
            <div style={{ padding: '8px 10px 0' }}>
              <div style={{ fontSize: '9px', fontWeight: 500, color: c.dm, marginBottom: '3px' }}>Style</div>
              {seg(themes.map(id => ({ label: id, on: style.theme === id, click: () => setTheme(id) })))}
            </div>
          )}

          {/* Options */}
          {data && (
            <div style={{ padding: '6px 10px 0' }}>
              <div style={{ fontSize: '9px', fontWeight: 500, color: c.dm, marginBottom: '3px' }}>Options</div>
              {seg([
                {
                  label: 'Bold', on: style.headerBold,
                  click: () => { const n = { ...style, headerBold: !style.headerBold }; setStyle(n); if (hasSelection) emit('restyle-table', { style: n }); },
                },
                {
                  label: 'Borders', on: style.borderEnabled,
                  click: () => { const n = { ...style, borderEnabled: !style.borderEnabled }; setStyle(n); if (hasSelection) emit('restyle-table', { style: n }); },
                },
                {
                  label: 'Zebra', on: style.zebraRows,
                  click: () => { const n = { ...style, zebraRows: !style.zebraRows }; setStyle(n); if (hasSelection) emit('restyle-table', { style: n }); },
                },
              ])}
            </div>
          )}
        </>
      )}

      {/* ══ IMPORT ══ */}
      {panel === 'import' && (
        <div style={{ padding: '12px 10px', flex: 1 }}>
          <div style={{ fontSize: '9px', fontWeight: 500, color: c.dm, marginBottom: '6px' }}>
            Google Sheets URL
          </div>
          <input
            type="text"
            placeholder="https://docs.google.com/spreadsheets/d/…"
            value={sheetUrl}
            onInput={e => { setSheetUrl((e.target as HTMLInputElement).value); setSheetError(null); }}
            style={{
              width: '100%', padding: '8px 10px', fontSize: '10px',
              border: `1px solid ${sheetError ? '#e55' : c.bd}`, borderRadius: '3px',
              background: c.inp, color: c.tx,
              fontFamily: 'SF Mono, Consolas, monospace',
            }}
          />
          {sheetError && (
            <div style={{
              marginTop: '6px', padding: '6px 8px', borderRadius: '3px',
              background: dark ? '#2a1a1a' : '#fff5f5',
              border: `1px solid ${dark ? '#5a2a2a' : '#ffc0c0'}`,
              fontSize: '9px', color: dark ? '#ff8888' : '#cc3333', lineHeight: '1.6',
            }}>{sheetError}</div>
          )}
          <div style={{
            marginTop: '8px', padding: '8px', borderRadius: '3px',
            background: dark ? '#222' : '#f8f8f8',
            border: `1px solid ${c.bd}`, fontSize: '9px', color: c.dm, lineHeight: '1.7',
          }}>
            Sheet must be <strong style={{ fontWeight: 600, color: c.tx }}>Anyone with the link can view</strong>
            {' '}or published via File → Share → Publish to web.
          </div>
          <button
            onClick={() => {
              if (!sheetUrl.trim() || sheetLoading) return;
              setSheetLoading(true);
              setSheetError(null);
              emit('fetch-sheet', { url: sheetUrl.trim() });
            }}
            disabled={!sheetUrl.trim() || sheetLoading}
            style={{
              marginTop: '10px', width: '100%', padding: '9px 0',
              border: 'none', borderRadius: '3px', fontSize: '10px', fontWeight: 600,
              cursor: sheetUrl.trim() && !sheetLoading ? 'pointer' : 'default',
              background: sheetUrl.trim() && !sheetLoading ? c.ac : c.bd,
              color: sheetUrl.trim() && !sheetLoading ? (dark ? '#1c1c1c' : '#fff') : c.dm,
            }}
          >
            {sheetLoading ? 'Loading…' : 'Import sheet'}
          </button>
        </div>
      )}

      {/* ══ EXPORT ══ */}
      {panel === 'export' && (
        <div style={{ padding: '12px 10px', flex: 1 }}>
          {!data ? (
            <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '10px', color: c.dm, lineHeight: '1.7' }}>
              Paste data in the Data tab first.
            </div>
          ) : (
            <>
              {/* CSV */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: c.tx }}>CSV</span>
                  <span style={{ fontSize: '9px', color: c.dm }}>{data.headers.length} cols · {data.rows.length} rows</span>
                </div>
                <div style={{ fontSize: '9px', color: c.dm, marginBottom: '7px', lineHeight: '1.5' }}>
                  Opens in Excel, Numbers, Google Sheets.
                </div>
                <button
                  onClick={() => emit('export-csv', { data })}
                  style={{
                    width: '100%', padding: '8px 0',
                    border: `1px solid ${c.bd}`, borderRadius: '3px',
                    fontSize: '10px', fontWeight: 500, cursor: 'pointer',
                    background: exportDone === 'csv' ? (dark ? '#1e2e1e' : '#f2faf2') : c.sf,
                    color: exportDone === 'csv' ? (dark ? '#7abf7a' : '#2d6b2d') : c.tx,
                  }}
                >
                  {exportDone === 'csv' ? '✓ Copied' : 'Copy as CSV'}
                </button>
              </div>

              <div style={{ borderTop: `1px solid ${c.bd}`, margin: '0 0 14px' }} />

              {/* JSON - array only, tokens removed */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: c.tx }}>JSON</span>
                </div>
                <div style={{ fontSize: '9px', color: c.dm, marginBottom: '7px', lineHeight: '1.5' }}>
                  Array of objects - paste into any JS/TS codebase or AI context.
                </div>
                <button
                  onClick={() => emit('export-json', { data, mode: 'array' })}
                  style={{
                    width: '100%', padding: '8px 0',
                    border: `1px solid ${c.bd}`, borderRadius: '3px',
                    fontSize: '10px', fontWeight: 500, cursor: 'pointer',
                    background: exportDone === 'json' ? (dark ? '#1e2e1e' : '#f2faf2') : c.sf,
                    color: exportDone === 'json' ? (dark ? '#7abf7a' : '#2d6b2d') : c.tx,
                  }}
                >
                  {exportDone === 'json' ? '✓ Copied' : 'Copy as JSON'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Create ── */}
      {panel === 'main' && (
        <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
          <button
            onClick={data ? create : undefined}
            disabled={!data}
            style={{
              width: '100%', padding: '11px 0',
              border: 'none', borderRadius: '0',
              fontSize: '11px', fontWeight: 600,
              cursor: data ? 'pointer' : 'default',
              background: !data ? c.bd : status === 'created' ? '#4ade80' : c.ac,
              color: !data ? c.dm : status === 'created' ? '#fff' : (dark ? '#1c1c1c' : '#fff'),
            }}
          >
            {status === 'created' ? '✓ Created' : hasSelection ? 'Restyle table' : data ? 'Create table  ⌘↵' : 'Create table'}
          </button>
        </div>
      )}
    </div>
  );
}