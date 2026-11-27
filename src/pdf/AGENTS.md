# PDF

## Overview

Server only. Turns a ready report into a branded PDF with `@react-pdf/renderer` (spec 0015). PDFs are made when asked for and never stored. The routes reach this folder through `src/assistant/report-pdf.ts`.

## Key files

| Path                   | Owns                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `index.tsx`            | `reportPdf(input)`: Luna's plan or the shared block layout, as a Buffer                              |
| `luna/`                | The standalone Luna's `MarketingPlanPDF`, ported as is (cover, contents with page numbers, sections) |
| `luna-plan.ts`         | Pure adapter from Luna's five content slices to the ported `Plan` shape, next steps included         |
| `report/ReportPDF.tsx` | The shared layout for Stellar and Beacon: header, every report block in panel order, footer          |
| `assets.ts`            | Registers Montserrat from `fonts/` once and returns the logo as a data URI                           |
| `fonts/`               | Montserrat TTF files                                                                                 |

## Conventions

- PDFs can't read CSS variables, so this folder writes the DESIGN.md brand colors as hex. It sits outside `pnpm check:colors`, like `src/email/`.
- Stellar and Beacon draw the same `ReportBlock`s the panel shows (the reader for the run's stored version), so the PDF and the panel always agree. A new block kind needs a case in `ReportPDF.tsx`.
- Fonts and the logo are read from disk at run time. `next.config.ts` traces `src/pdf/fonts/**` and `public/brand/logo.png` into the PDF and email routes; a new route that renders PDFs needs the same entry.
- Rendering takes a few seconds; both routes allow 60.

## Related specs

- [0015 Report PDF and email](../../docs/specs/0015-report-pdf-email/index.md)

_Drafted by /develop from the introducing change, worth a quick human pass._
