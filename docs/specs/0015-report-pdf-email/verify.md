# Verify: Report PDF and email · spec 0015 · updated 2026-11-27

_Steps derived from spec 0015 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Recorded during the build (2026-11-27)

- `e2e/beacon-flow.spec.ts` (scripted fake model) passed on desktop light and phone dark: after the ready Beacon report, Download PDF returns `200 application/pdf` named `BeamX-Beacon-<day>.pdf` starting with `%PDF-`, and Email me this report shows "Sent to a***@…" (off Vercel with no Resend key, the email is printed to the server terminal).
- `e2e/flow.spec.ts` gained the guest check (Download PDF works, no email button, "Create a free account" shown), but did not run to that point locally: the guest starter grant per IP cap on this machine leaves the guest short of credits. CI runs it.
- `e2e/design.spec.ts` passes with the new "Keep this report" showcase; its axe scan now has a 90 second budget, since the page took close to 30 seconds on a phone under load.
- Unit tests: `src/pdf/pdf.test.ts` renders a real Beacon PDF and a real Luna plan (more than 5 pages); `src/assistant/report-share.test.ts` covers the file name, the Lagos date, owner only, not ready, the guest refusal, 5 an hour, and the count given back on a failed send; `src/email/report-email.test.ts` covers the attachment and the template.
- The build traces `src/pdf/fonts/*.ttf` and `public/brand/logo.png` into both routes (checked in `.next/server/app/api/runs/[runId]/pdf/route.js.nft.json`).
- Not yet done: looking at the PDFs by eye (no PDF viewer on this machine), and a real email through Resend on a preview.

## UI / manual

- [ ] A ready Stellar report shows Download PDF and Email me this report under it → AC-6
- [ ] Download PDF saves `BeamX-Stellar-<day>.pdf`; it opens with the BeamX header, "Your Stellar report", the date, every panel section in order, and "beamxsolutions.com" with page numbers in the footer → AC-1, AC-3
- [ ] A Beacon PDF shows the business name in its header, the score, the five area bars and the advisory sections → AC-3
- [ ] A Luna PDF has the cover, the contents with page numbers, the eight sections, and Next Steps ending "Book a free strategy call with BeamX to get started." → AC-2
- [ ] The PDFs use Montserrat and the brand blues → AC-4
- [ ] Email me this report (signed in) → "Sent to a***@gmail.com"; the email arrives with the PDF attached, the headline, an Open the chat button that opens this chat, and the strategy call line → AC-5, AC-6
- [ ] A guest sees "Want it by email? Create a free account", which opens sign up → AC-5, AC-6
- [ ] Send six emails within an hour → the sixth shows the hourly limit message → AC-5
- [ ] `/design`: the four "Keep this report" states pass axe in both themes → AC-6

## Value sourcing

- [ ] Another user's run id at `/api/runs/<id>/pdf` → `404`; a run still generating → `409 not_ready` → AC-1
- [ ] Deploy logs for a download and an email show only `runId` and the outcome, never the address → AC-7
