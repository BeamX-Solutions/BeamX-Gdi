# 0016. Book a consultation

**Date**: 2026-11-27
**Status**: In Progress

## Summary

After a report, or whenever the client asks, the assistant offers BeamX's free 30 minute strategy call and the client books it without leaving the chat. The chat shows Calendly's own booking widget, prefilled with the client's name and email. Calendly's signed webhook tells the app about the booking: the app records it, confirms it in the chat, and emails BeamX the client's context with their reports as PDFs (spec 0015). This is the product's main success measure.

> Written on the engineer's instruction to go with the recommended picks (2026-11-27): "Calendly embed + webhook". Review before relying on it.

## Requirements

**User stories**:

- As a business owner, I want to book a call with BeamX right after my report, without leaving the chat or retyping my details.
- As a BeamX adviser, I want each booking to arrive with the client's reports, so I come to the call prepared.

**Acceptance criteria**:

- **AC-1**: A new assistant tool `offerConsultation` (no money, no approval) shows a booking card in the thread. The instructions offer it once after a ready report's first follow up, and whenever the client asks to talk to someone, book a call, or get help putting a report into action. It is free and works for guests and accounts.
- **AC-2**: The tool creates one `consultation` row per chat (status `offered`), or reuses the chat's open one (offered or booked), and returns its id, its state and the Calendly link (`CALENDLY_URL`). The card prefills an account's name and email from the browser session (none for a guest), so no contact detail passes through the model.
- **AC-3**: The card's "Book a time" button opens a dialog with Calendly's inline embed (Calendly's own page in an iframe, the same one `widget.js` builds, with no third party script on our page), prefilled with name and email and carrying the consultation id as `utm_content`. Only a `calendly.event_scheduled` message from the `https://calendly.com` origin counts. When the widget reports `calendly.event_scheduled`, the dialog closes and the card says "Booked. Calendly has emailed you the details." while it waits for the webhook to confirm.
- **AC-4**: `POST /api/webhooks/calendly` trusts nothing until `Calendly-Webhook-Signature` (`t=<unix>,v1=<hex>`) matches the HMAC SHA256 of `<t>.<raw body>` under `CALENDLY_WEBHOOK_SIGNING_KEY`, and `t` is within 5 minutes; otherwise `401`. Without the key it answers `503`. Events for no known consultation (no or unknown `utm_content`, such as bookings made outside the app) answer `200` and change nothing.
- **AC-5**: `invitee.created` moves the consultation to `booked` once, saving the start time, the Calendly event and invitee URIs. Only the call that makes that move (a retried webhook makes none) appends an assistant message to the chat ("You're booked for a free strategy call on Wed 2 Dec at 10:00 (Lagos time). Calendly has emailed you the details.") and emails BeamX.
- **AC-6**: The BeamX email goes to `CONSULTATION_NOTIFY_EMAIL` with the client's name and email (from Calendly's payload), the call time in Lagos, the business profile fields (spec 0012), and the client's up to 3 newest ready reports attached as PDFs (spec 0015). A send failure is logged and does not fail the webhook (the booking stays recorded).
- **AC-7**: `invitee.canceled` moves a `booked` consultation to `canceled` once, appends "Your strategy call was canceled. Ask me any time to book another." to the chat, and emails BeamX a short cancel notice. A canceled chat may be offered a new call (the tool makes a new row).
- **AC-8**: The card reads its live state from `GET /api/consultations/[id]` (owner only, `404` otherwise): offered, booked with the time, or canceled. After `event_scheduled` it polls every 3 seconds for up to 60 seconds; a reload shows the saved state.
- **AC-9**: Logs carry ids, the event name and the outcome only, never names, emails or answers. `consultation_booked` is logged once per booking (the success measure).
- **AC-10**: `pnpm calendly:subscribe` (staff only, needs `CALENDLY_API_TOKEN`) creates the organization webhook subscription for `invitee.created` and `invitee.canceled` pointing at the production URL, with the signing key. The token is used only by this script, never at run time.

**Non goals**: our own calendar or availability; rescheduling inside the app (Calendly's own emails handle it, and arrive as cancel plus create); reminders; paid consultations.

## Decision

**Chosen option**: Calendly's inline embed in a dialog, plus Calendly's signed webhook as the source of truth. It keeps BeamX's existing Calendly (`calendly.com/beamxsolutions`), its availability and its emails, and needs a Calendly Standard plan or higher for webhooks.

## Rationale

See [rationale.md](./rationale.md).

## Feature design

**Data model**: `consultation` (`id uuid`, `user_id` → user, `conversation_id` → conversation, `status consultation_status ('offered' | 'booked' | 'canceled')`, `start_time timestamptz null`, `calendly_event_uri text null`, `calendly_invitee_uri text null unique`, `created_at`, `updated_at`, `booked_at null`, `canceled_at null`). A partial unique index keeps one `offered` row per conversation. Rows follow the user on a guest link (spec 0002, the same statement list as runs) and are deleted with the user.

**Env** (`src/lib/env.ts`, `.env.example`): `CALENDLY_URL` (url, default `https://calendly.com/beamxsolutions`), `CALENDLY_WEBHOOK_SIGNING_KEY` (optional), `CALENDLY_API_TOKEN` (optional, script only), `CONSULTATION_NOTIFY_EMAIL` (optional email; without it the BeamX email is skipped and logged).

**Modules**: `src/assistant/consultation/` holds the pure parts (signature check, payload schema, message words, the email input) and the webhook handler with its effects passed in. `src/db/queries/consultations.ts` holds the writes; the transitions are single `UPDATE … WHERE status = …  RETURNING`, so a retried webhook changes nothing. The assistant tool lives in `src/assistant/tools/offer-consultation.ts`. The card and dialog live in `src/components/consultation/`. The call time words (`callTime`) live in `src/lib/call-time.ts`, shared by the chat message and the card.

**Webhook payload** (Zod, `.passthrough()` on everything else): `event`, `payload.uri` (invitee), `payload.name`, `payload.email`, `payload.event` (event URI), `payload.scheduled_event.start_time`, `payload.tracking.utm_content`.

## Build plan

1. Schema, migration, queries, link and delete coverage, integration tests.
2. `src/assistant/consultation/`: signature, payload, words, the handler; unit tests.
3. The webhook route, the status route, the BeamX email (reusing `src/pdf` and the mailer pattern).
4. The tool, the instructions, the card and dialog with the Calendly widget, `/design`, the fake model script, and Playwright (offer, open, the scripted `event_scheduled`, and a signed webhook posted by the test).
5. `pnpm calendly:subscribe`, the eval cases (offer after a report, offer on request), docs.

## Consequences

- BeamX's Calendly needs the Standard plan for webhooks, a personal access token for the subscribe script, and the subscription made once per environment.
- Bookings made on Calendly outside the app are ignored by the webhook.
- A booking whose webhook never arrives stays `offered`; the client still has Calendly's email, and BeamX still has the booking in Calendly.

## Follow-up

- Reschedule shows as a cancel then a new booking; if that reads badly, handle Calendly's `rescheduled` flag later.
