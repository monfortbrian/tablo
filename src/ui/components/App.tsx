import { h } from 'preact';
import { useState, useCallback, useEffect } from 'preact/hooks';
import { emit, on } from '@create-figma-plugin/utilities';
import { parseInput, getAlignmentForType } from '../../shared/parser';
import { TableData, TableStyle, ThemeId, THEME_PRESETS } from '../../shared/types';

export function App() {
  const [raw, setRaw] = useState('');
  const [data, setData] = useState<TableData | null>(null);
  const [style, setStyle] = useState<TableStyle>({ ...THEME_PRESETS.minimal, columnAlignment: [] });
  const [status, setStatus] = useState<'idle' | 'created'>('idle');
  const [hasSelection, setHasSelection] = useState(false);
  const [dark, setDark] = useState(() => {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
  });

  const c = dark
    ? { bg: '#1c1c1c', sf: '#252525', bd: '#333', tx: '#d4d4d4', dm: '#666', ac: '#e0e0e0', inp: '#222' }
    : { bg: '#f7f7f7', sf: '#fff', bd: '#e4e4e4', tx: '#1a1a1a', dm: '#aaa', ac: '#1a1a1a', inp: '#fafafa' };

  useEffect(() => {
    on('selection-text', (msg: { text: string }) => setRaw(msg.text));
    on('tablo-selected', () => setHasSelection(true));
    on('table-created', () => { setStatus('created'); setTimeout(() => setStatus('idle'), 1800); });
  }, []);

  useEffect(() => {
    if (!raw.trim()) { setData(null); return; }
    const d = parseInput(raw);
    if (d && d.rows.length > 0) {
      setData(d);
      setStyle(p => ({ ...p, columnAlignment: d.columnTypes.map(getAlignmentForType) }));
    } else { setData(null); }
  }, [raw]);

  const create = useCallback(() => {
    if (!data) return;
    if (hasSelection) {
      emit('restyle-table', { style });
    } else {
      emit('create-table', { data, style });
    }
  }, [data, style, hasSelection]);

  const setTheme = useCallback((id: ThemeId) => {
    const next = { ...THEME_PRESETS[id], columnAlignment: style.columnAlignment };
    setStyle(next);
    if (hasSelection) emit('restyle-table', { style: next });
  }, [hasSelection, style.columnAlignment]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && data) create(); };
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

  return (
    <div style={{
      display: 'flex', flexDirection: 'column' as const, height: '100%',
      fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px',
      color: c.tx, background: c.bg, overflow: 'hidden',
    }}>
      <style>{`
        textarea::-webkit-scrollbar, div::-webkit-scrollbar { width: 3px; height: 3px; }
        textarea::-webkit-scrollbar-thumb, div::-webkit-scrollbar-thumb { background: ${c.bd}; border-radius: 2px; }
        textarea::-webkit-scrollbar-track, div::-webkit-scrollbar-track { background: transparent; }
        textarea { scrollbar-width: thin; scrollbar-color: ${c.bd} transparent; }
      `}</style>

      {/* Data label + dark/light toggle on same line */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 10px 0',
      }}>
        <span style={{ fontSize: '9px', fontWeight: 500, color: c.dm }}>Data</span>
        <div onClick={() => setDark(!dark)} style={{
          width: '28px', height: '16px', borderRadius: '8px', cursor: 'pointer',
          background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
          position: 'relative' as const, transition: 'background 0.2s',
        }}>
          <div style={{
            width: '12px', height: '12px', borderRadius: '6px',
            background: dark ? '#e0e0e0' : '#1a1a1a',
            position: 'absolute' as const, top: '1px',
            left: dark ? '14px' : '1px', transition: 'left 0.2s',
          }} />
        </div>
      </div>

      {/* Textarea - expandable */}
      <div style={{ padding: '4px 10px 0' }}>
        <textarea
          style={{
            width: '100%', minHeight: '48px', maxHeight: '220px',
            border: `1px solid ${c.bd}`, borderRadius: '3px',
            padding: '8px 10px', fontSize: '10px',
            fontFamily: 'SF Mono, Consolas, monospace', lineHeight: '1.5',
            resize: 'vertical' as const, outline: 'none', color: c.tx, background: c.inp,
            boxSizing: 'border-box' as const,
          }}
          placeholder={'Paste CSV, TSV, or tab data here...'}
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
            <span style={{ fontSize: '9px', fontWeight: 500, color: c.dm }}>Preview · {data.headers.length}×{data.rows.length}</span>
            <span style={{ fontSize: '9px', color: c.dm, cursor: 'pointer' }} onClick={() => { setRaw(''); setData(null); }}>clear</span>
          </div>
          <div style={{ flex: '1', overflow: 'auto', borderRadius: '3px', border: `1px solid ${c.bd}`, background: c.sf }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '10px' }}>
              <thead>
                <tr>{data.headers.map((h, i) => (
                  <th key={i} style={{
                    padding: '6px 8px', fontSize: '9px', fontWeight: 600,
                    textTransform: 'uppercase' as const, letterSpacing: '0.3px',
                    textAlign: (style.columnAlignment[i] || 'left') as any,
                    background: style.headerBg, color: style.headerTextColor,
                    borderBottom: `1px solid ${c.bd}`, whiteSpace: 'nowrap' as const,
                    position: 'sticky' as const, top: '0', zIndex: 1,
                  }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {data.rows.slice(0, 5).map((r, ri) => (
                  <tr key={ri}>{r.map((ce, ci) => (
                    <td key={ci} style={{
                      padding: '5px 8px', fontSize: '10px', color: dark ? '#aaa' : '#555',
                      textAlign: (style.columnAlignment[ci] || 'left') as any,
                      background: style.zebraRows && ri % 2 === 1 ? (dark ? '#2a2a2a' : style.zebraColor) : 'transparent',
                      borderBottom: style.borderEnabled ? `1px solid ${c.bd}` : 'none',
                      whiteSpace: 'nowrap' as const,
                      maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{ce || '-'}</td>
                  ))}</tr>
                ))}
              </tbody>
            </table>
            {data.rows.length > 5 && (
              <div style={{ textAlign: 'center', fontSize: '9px', color: c.dm, padding: '3px' }}>+{data.rows.length - 5} more</div>
            )}
          </div>
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
            { label: 'Bold', on: style.headerBold, click: () => { const n = { ...style, headerBold: !style.headerBold }; setStyle(n); if (hasSelection) emit('restyle-table', { style: n }); } },
            { label: 'Borders', on: style.borderEnabled, click: () => { const n = { ...style, borderEnabled: !style.borderEnabled }; setStyle(n); if (hasSelection) emit('restyle-table', { style: n }); } },
            { label: 'Zebra', on: style.zebraRows, click: () => { const n = { ...style, zebraRows: !style.zebraRows }; setStyle(n); if (hasSelection) emit('restyle-table', { style: n }); } },
          ])}
        </div>
      )}

      {/* Create */}
      <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
        <button
          onClick={data ? create : () => { }}
          disabled={!data}
          style={{
            width: '100%', padding: '11px 0', border: 'none', borderRadius: '0',
            fontSize: '11px', fontWeight: 600, cursor: data ? 'pointer' : 'default',
            background: !data ? c.bd : status === 'created' ? '#4ade80' : c.ac,
            color: !data ? c.dm : status === 'created' ? '#fff' : (dark ? '#1c1c1c' : '#fff'),
          }}
        >{status === 'created' ? '✓ Created' : hasSelection ? 'Restyle table' : 'Create table'}</button>
      </div>
    </div>
  );
}