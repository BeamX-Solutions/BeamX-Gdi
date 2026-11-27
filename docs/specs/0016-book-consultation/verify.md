# Verify: Book a consultation · spec 0016 · updated 2026-11-27

_Steps derived from spec 0016 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Recorded during the build (2026-11-27)

- `e2e/consultation.spec.ts` (scripted fake model, Calendly's page stubbed at its real origin) passed on desktop light, desktop dark and phone light: "Can I book a strategy call?" shows the card, Book a time opens the dialog with our id as `utm_content`, the booked message closes it and the card says "Booked. Calendly has emailed you the details.", a bad signature gets `401`, the signed `invitee.created` webhook gets `200`, the card's poll shows "Booked for Wed 2 Dec at 10:00 (Lagos time).", and a reload keeps the card and the chat's confirmation.
- `chat.spec`, `design.spec` pass. The live region test in `chat.spec` raced on a slow machine (its observer was attached after streaming began); it now watches before streaming starts and passed 20 of 20.
- Unit tests: the signature (right key, 5 minute window, a changed body), the webhook (book once, retry changes nothing, outside bookings ignored, a failed follow up still answers 200, cancel, no names or emails in logs), the card states, the thread item, the fake script.
- Migration `0007_consultation` is applied to the dev branch. `consultations.int.test.ts` (one offer per chat, owner only, book and cancel once, guest link) runs in CI only (no Neon API key here).
- Not yet done: a real Calendly booking. It needs the Standard plan, `CALENDLY_API_TOKEN` and `CALENDLY_WEBHOOK_SIGNING_KEY` on the deploy, `pnpm calendly:subscribe` against it, and `CONSULTATION_NOTIFY_EMAIL`.

## UI / manual

- [ ] After a ready report, ask a follow up → the reply ends with the strategy call card → AC-1
- [ ] "I'd like to talk to someone at BeamX" → the card → AC-1
- [ ] Book a time (signed in) → Calendly's page in the dialog with your name and email filled in; as a guest, empty → AC-3
- [ ] Book a real slot → the dialog closes, the card says "Booked…", then within a few seconds "Booked for <day> at <time> (Lagos time)." → AC-3, AC-8
- [ ] Reload → the booked card and the chat's "You're booked…" message → AC-5, AC-8
- [ ] BeamX's inbox (`CONSULTATION_NOTIFY_EMAIL`) gets "New strategy call: <name>, <time>" with the profile and up to 3 report PDFs → AC-6
- [ ] Cancel from Calendly's email → the chat says it was canceled, BeamX gets the cancel notice, and asking again shows a new card → AC-7
- [ ] `/design`: the four strategy call card states pass axe in both themes → AC-1

## Value sourcing

- [ ] A webhook with a wrong or old signature → `401`; without `CALENDLY_WEBHOOK_SIGNING_KEY` → `503` → AC-4
- [ ] A booking made on Calendly directly (no `utm_content`) → `200`, nothing changes → AC-4
- [ ] Calendly's retry of the same booking → no second chat message or email → AC-5
- [ ] `GET /api/consultations/<id>` for another user → `404` → AC-8
- [ ] Deploy logs for a booking show ids and outcomes only, and `consultation_booked` once → AC-9
