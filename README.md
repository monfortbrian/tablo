# Tablo - Smart Tables for Real Data

> Paste any data. Get a beautiful, styled table in Figma. No manual setup.

## What it does

- **Smart paste**: CSV, TSV, Excel, markdown, tab-separated, multi-space. Paste from anywhere, Tablo figures it out.
- **5 built-in themes**: Minimal, Stripe, Notion, Dashboard, Brutalist
- **Auto column alignment**: numbers right, dates centered, text left
- **Per-column controls**: horizontal (left/center/right/justify) and vertical (top/middle/bottom) per column
- **Export**: Copy as CSV or JSON (array of objects) for dev handoff
- **Import**: Google Sheets URL and Excel Online share links (public/anyone-with-link only)

## Import sources

| Source | How |
|---|---|
| Google Sheets | Share → General access → Anyone with the link → paste URL |
| Excel Online (OneDrive) | Share → Anyone with the link → paste URL |
| Airtable | Select rows → Copy → Paste in Data tab |
| Notion | Select database rows → Copy → Paste in Data tab |
| Any web table | Select cells → Copy → Paste in Data tab |

## Themes

`Minimal` · `Stripe` · `Notion` · `Dashboard` · `Brutalist`

## Keyboard shortcut

`⌘ + Enter` - create table

## networkAccess (manifest.json)

Required for URL import to work. Already included:

```json
"networkAccess": {
  "allowedDomains": [
    "https://docs.google.com",
    "https://onedrive.live.com",
    "https://1drv.ms",
    "https://*.sharepoint.com"
  ]
}
```

## Versioning

| Version | What changed |
|---|---|
| v1.1.0 | Excel Online import, Airtable/Notion copy-paste guide, typed sheet errors |
| v1.0.0 | Initial release |

## Who it's for

Designers building dashboards, admin panels, data tables, and reports who are tired of dummy data and manual column resizing.

## Author

[Monfort N. Brian](https://github.com/monfortbrian)