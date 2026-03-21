export interface TableData {
  headers: string[];
  rows: string[][];
  columnTypes: ColumnType[];
}

export type ColumnType = 'text' | 'number' | 'currency' | 'percentage' | 'date' | 'mixed';

export type ThemeId = 'minimal' | 'stripe' | 'notion' | 'dashboard' | 'brutalist';

export interface TableStyle {
  theme: ThemeId;
  headerBold: boolean;
  headerBg: string;
  headerTextColor: string;
  borderEnabled: boolean;
  borderColor: string;
  zebraRows: boolean;
  zebraColor: string;
  cellPaddingX: number;
  cellPaddingY: number;
  fontSize: number;
  fontFamily: string;
  rowHeight: number;
  columnAlignment: ('left' | 'center' | 'right')[];
}

export const THEME_PRESETS: Record<ThemeId, Omit<TableStyle, 'columnAlignment'>> = {
  minimal: {
    theme: 'minimal', headerBold: true, headerBg: '#F5F5F5', headerTextColor: '#1A1A1A',
    borderEnabled: true, borderColor: '#E5E5E5', zebraRows: false, zebraColor: '#FAFAFA',
    cellPaddingX: 16, cellPaddingY: 10, fontSize: 13, fontFamily: 'Inter', rowHeight: 40,
  },
  stripe: {
    theme: 'stripe', headerBold: true, headerBg: '#F7F7F7', headerTextColor: '#1A1A1A',
    borderEnabled: false, borderColor: '#E5E5E5', zebraRows: true, zebraColor: '#FAFAFA',
    cellPaddingX: 16, cellPaddingY: 10, fontSize: 13, fontFamily: 'Inter', rowHeight: 40,
  },
  notion: {
    theme: 'notion', headerBold: true, headerBg: '#FFFFFF', headerTextColor: '#9B9B9B',
    borderEnabled: true, borderColor: '#EBEBEB', zebraRows: false, zebraColor: '#FAFAFA',
    cellPaddingX: 12, cellPaddingY: 8, fontSize: 14, fontFamily: 'Inter', rowHeight: 36,
  },
  dashboard: {
    theme: 'dashboard', headerBold: true, headerBg: '#1A1A2E', headerTextColor: '#FFFFFF',
    borderEnabled: true, borderColor: '#2D2D44', zebraRows: true, zebraColor: '#F8F9FC',
    cellPaddingX: 16, cellPaddingY: 10, fontSize: 13, fontFamily: 'Inter', rowHeight: 44,
  },
  brutalist: {
    theme: 'brutalist', headerBold: true, headerBg: '#000000', headerTextColor: '#FFFFFF',
    borderEnabled: true, borderColor: '#000000', zebraRows: false, zebraColor: '#F0F0F0',
    cellPaddingX: 14, cellPaddingY: 10, fontSize: 13, fontFamily: 'Inter', rowHeight: 42,
  },
};