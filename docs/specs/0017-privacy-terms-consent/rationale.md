# 0017. Privacy, terms and consent: rationale

## Context

The workspace stores business data, chat messages and reports, sends them to an AI provider abroad, and takes payments. Nigeria's Data Protection Act 2023 and, for clients abroad, the GDPR require a clear notice, a lawful basis, access and deletion rights, and consent for any non essential tracking. Account deletion already exists (spec 0009, the delete account dialog and the cascade).

## Options considered

1. **Notice plus recorded acceptance, no banner while nothing is tracked** (chosen). The lawful basis for running the tools is the service contract; the session and bot check cookies are strictly necessary, so they need no consent. Recording the accepted terms version per account lets a later change ask again.
2. **A cookie banner on every visit now**. Common, but asks consent for nothing optional, adds friction on a phone first product, and trains people to click past banners.
3. **A third party consent platform**. Useful once there are several trackers; overkill with none, and itself a tracker.

Export: an instant JSON download (chosen) meets the portability right in seconds and reuses the query layer; an emailed zip with PDFs would need a background job and storage for little gain, since reports already download as PDFs (spec 0015).

## Rationale

The smallest compliant set: honest policies, linked where people act, acceptance recorded where it matters (accounts), and a one click export beside the existing delete. Holding the text in typed content keeps the pages static and the version in one place, and the placeholder check stops an unnamed policy reaching production.

## References

- Nigeria Data Protection Act 2023: https://ndpc.gov.ng/resources/
- GDPR, data portability (Article 20): https://gdpr-info.eu/art-20-gdpr/
- ePrivacy, strictly necessary cookies: https://commission.europa.eu/resources-partners/europa-web-guide/design-content-and-development/privacy-security-and-legal-notices/cookies-and-similar-technologies_en
