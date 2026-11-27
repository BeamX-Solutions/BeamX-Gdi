# 0016. Book a consultation: rationale

## Context

All four standalone tools send clients to `calendly.com/beamxsolutions` today, as a plain link. The chat should book without leaving, and BeamX should get the client's reports with each booking. The engineer chose "Calendly embed + webhook" (2026-11-27).

## Options considered

1. **Calendly inline embed plus signed webhook** (chosen). Booking happens in Calendly's own widget, so availability, time zones and confirmation emails stay Calendly's. The webhook is signed, so the app can trust it, and it carries our `utm_content`, so it maps back to the chat. Needs Calendly Standard.
2. **Embed only, trusting the browser's `event_scheduled` message**. Free plan, but the message can be faked and is lost when the tab closes, so BeamX's email could be spoofed or never sent.
3. **Our own scheduling (Google Calendar API)**. Full control, but rebuilds availability, time zones, emails and reschedule, and leaves the Calendly BeamX already runs.

## Rationale

Option 1 is the smallest build that is trustworthy: the webhook is the only thing that changes data, and it is signed and replay limited. The browser message only makes the card feel instant. A consultation row per chat gives the webhook a safe key (an unguessable id we made, never a user id), and the single statement transitions make Calendly's retries harmless. Guests may book too, since the call is the success measure and Calendly collects the contact details itself.

## References

- Calendly embed options (prefill, utm): https://help.calendly.com/hc/en-us/articles/223147027
- Calendly webhook signatures: https://developer.calendly.com/api-docs/4c305798a61d3-webhook-signatures
- Calendly webhook subscriptions: https://developer.calendly.com/api-docs/c1ddc06ce1f1b-create-webhook-subscription
