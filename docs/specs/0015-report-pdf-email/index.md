# 0015. Report PDF and email

**Date**: 2026-11-27
**Status**: In Progress

## Summary

Every ready report can be downloaded as a branded PDF, or emailed to the client with the PDF attached, as the standalone tools do today. Luna's plan uses the standalone's full plan layout (cover, contents, sections), ported as is; Stellar and Beacon use one shared branded layout drawn from the same report blocks the panel shows. PDFs are made on the server when asked for, never stored.

> Written on the engineer's instruction to go with the recommended picks (2026-11-27). Review before relying on it.

## Requirements

**User stories**:
- As a business owner, I want to keep my report as a PDF and share it with my partner or bank.
- As a business owner, I want my report in my inbox so I can find it later.

**Acceptance criteria**:
- **AC-1**: `GET /api/runs/[runId]/pdf` returns the run's ready report as `application/pdf`, named `BeamX-<Tool>-<YYYY-MM-DD>.pdf` (the day it finished, Lagos), for the run's owner only. Another user's or an unknown run is `404`; a report that is not ready is `409 not_ready`. Nothing is stored.
- **AC-2**: Luna's PDF is the standalone's `MarketingPlanPDF` (cover, contents with page numbers, the eight sections, next steps), ported into `src/pdf/luna/` and fed by an adapter from Luna's five content slices. Business, industry and model come from the answers; the date is the run's finish day; next steps are the roadmap's first phase steps (up to 5) with the note "Book a free strategy call with BeamX to get started."
- **AC-3**: Stellar and Beacon PDFs use one shared layout in `src/pdf/report/`: a header with the BeamX logo, the tool name, the business name when known and the date; then every report block in the panel's order, drawn as text, bars and lists; then a footer with the page number and "beamxsolutions.com". The blocks are the tool's own view (spec 0005 readers), so the PDF and the panel always agree, including older report versions.
- **AC-4**: PDFs use Montserrat (the brand font, spec 0003 and feature #23) from TTF files in `src/pdf/fonts/`, bundled with the PDF and email routes, and the DESIGN.md brand colors as hex values (PDFs cannot read CSS variables). `src/pdf/` sits outside `pnpm check:colors`, like `src/email/`.
- **AC-5**: `POST /api/runs/[runId]/email` emails the report to the signed in account's verified address, with the PDF attached and a short React Email body (the tool name, the headline result, a link back to the chat, and the consultation invitation). Guests get `401 sign_in_required`; the report panel shows them the sign up prompt instead. A user may send at most 5 report emails an hour (`LimitStore`, failing open as every limit); over that is `429`. A send failure is `502 email_send_failed`, shown as a friendly error.
- **AC-6**: The report panel shows "Download PDF" and "Email me this report" under a ready report. Email shows "Sent to a***@gmail.com" on success (the address masked), or the friendly error.
- **AC-7**: Both routes allow up to 60 seconds and log only ids and outcomes, never the address or report content.

## Decision

**Chosen option**: server side `@react-pdf/renderer`, the standalone's Luna layout ported, one shared layout for the other tools.

**Implementation skills**: `react-email` (`resend/resend-skills`, `.claude/skills/react-email/`) · `resend` (`resend/resend-skills`, `.claude/skills/resend/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `playwright-cli` (`microsoft/playwright-cli`, `.claude/skills/playwright-cli/`)

## Rationale

- **Same engine as the standalone**: `@react-pdf/renderer` already produces Luna's PDFs in production; porting keeps the layout clients know and avoids a headless browser (heavy on serverless).
- **Generated on demand, not stored**: a PDF is a pure function of the stored report, so storing it would only add storage, a cleanup job and a stale copy risk.
- **One layout for the block based tools**: Stellar and Beacon reports are already report blocks; drawing blocks once covers both and every future block tool.
- **Rejected**: storing PDFs in Blob storage (no need yet); client side rendering (large bundle, and email needs the server anyway); HTML to PDF with a headless browser (cold starts and size on Hobby).

## Feature design

**Data model sketch**: no schema change.

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `GET /api/runs/[runId]/pdf` | route | `runId` | PDF bytes, `Content-Disposition: attachment` | run owner | `404`, `409 not_ready` |
| `POST /api/runs/[runId]/email` | route | `runId` | `{ ok, sentTo }` (masked) | signed in account, run owner | `401 sign_in_required`, `404`, `409 not_ready`, `429`, `502 email_send_failed` |
| `reportPdf(input)` | `src/pdf` | tool id, blocks or Luna content, header facts | `Buffer` | n/a | n/a |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| pdf | blocks | `runs.get` → `getReader(toolId, toolVersion)` → `buildView` (spec 0005) |
| pdf | Luna plan | `report.content` (spec 0013 slices) → `lunaPlan` adapter |
| pdf | business name | the run's answer to `business_name` / `business-name`, else omitted |
| pdf | date | `tool_run.completed_at`, Lagos day |
| email | address | the session account's email (verified, spec 0009) |
| email | headline | the first `score_header` block's title and score, else Luna's first executive summary stat |
| email | link back | `NEXT_PUBLIC_APP_URL` + `/c/<conversationId>` |

**Security model**: owner only for both routes; email only to the account's own verified address (never a typed address, so the route cannot be used to send mail to others); rate limited; logs carry ids only.

**Configuration required**: none new (`RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL` exist).

**Critical test scenarios**:
- A ready Beacon report downloads as a PDF starting with `%PDF`, verifies **AC-1**, **AC-3**
- A Luna plan renders the ported layout with every section, verifies **AC-2**
- A guest's email POST is `401`; the sixth email in an hour is `429`, verifies **AC-5**
- The panel shows both buttons only when the report is ready, verifies **AC-6**

## Build plan

1. `src/pdf/`: fonts, theme, the shared block layout, the ported Luna layout and adapter, `reportPdf`, unit tests that render real PDFs, satisfies **AC-2** to **AC-4**
2. The PDF route and its server read, tracing includes for the fonts, satisfies **AC-1**, **AC-7**
3. The email template, the email route with the rate limit, satisfies **AC-5**, **AC-7**
4. Panel buttons, `/design` state, Playwright (download returns a PDF; guest sees sign up), satisfies **AC-6**

## Consequences

**Positive**: clients can keep and share reports; the email doubles as a reminder to book a consultation.

**Negative / tradeoffs**: the PDF dependency adds weight to two server routes; every download renders afresh (a Luna plan takes a second or two); the ported Luna layout is a second copy to maintain until the standalone retires.

**Neutral**: a new top level module, `src/pdf/`, called from routes only.
