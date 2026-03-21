# Tablo

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Figma Plugin](https://img.shields.io/badge/Figma-Plugin-ff69b4.svg)](https://www.figma.com/community/plugin/tablo)

**Paste. Style. Ship.** Tables that just work in Figma.

> Built by [Monfort N. Brian](https://github.com/monfortbrian)

## What it does

1. Paste any data (CSV, TSV, markdown, spreadsheet, plain text)
2. Tablo auto-detects the format and builds a structured table
3. Pick a theme, tweak decorations
4. One click → beautiful auto-layout table in Figma

## Setup

```bash
git clone https://github.com/monfortbrian/tablo.git
cd tablo
npm install

# Development (watch mode)
npm run watch

# Production build
npm run build
```

Then in Figma Desktop:
- Plugins → Development → Import plugin from manifest
- Select the `manifest.json` in the project root

## Architecture

```
tablo/
├── src/
│   ├── shared/          # Shared between plugin + UI
│   │   ├── types.ts     # All types, themes, message contracts
│   │   └── parser.ts    # Smart format detection + parsing
│   ├── plugin/          # Figma sandbox code
│   │   └── main.ts      # Receives data → builds auto-layout table
│   └── ui/              # Plugin UI (Preact)
│       ├── index.tsx     # Entry point
│       └── components/
│           └── App.tsx   # Full UI: paste → preview → style → create
├── package.json
├── tsconfig.json
└── README.md
```

## Roadmap

### Free (v1)
- Smart paste detection (CSV, TSV, spaces, markdown)
- Instant table generation with auto-layout
- Header auto-styling
- 5 theme presets (Minimal, Stripe, Notion, Dashboard, Brutalist)
- Auto column alignment (numbers right, text left)
- Decoration panel (padding, borders, zebra, font size)
- ⌘Enter keyboard shortcut

### Free (v1.1)
- Column auto-width (fit to content / equalize)
- CSV/JSON export from Figma table
- Google Sheets URL import
- Select existing text → convert to table

### Pro (v2)
- Airtable / Notion database sync
- Table to chart conversion (bar, line, pie)
- Real data mode (replace Lorem Ipsum)
- Custom theme builder + save themes
- Priority support


## License

MIT
