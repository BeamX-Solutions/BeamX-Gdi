# 0018. Public landing page and SEO: rationale

## Context

Today `/` is the chat workspace for everyone. A shared link or a search result lands a stranger in an empty chat with no explanation. The engineer chose: new visitors see a landing page at the root, returning ones go straight to their chat; the app lives on `app.beamxsolutions.com`.

## Options considered

1. **Proxy rewrite on the session cookie** (chosen). `/` stays one URL; crawlers and new visitors (no cookie) get the static landing page, sessions get the workspace. The check is a cookie read in Proxy, which Next 16 recommends for exactly this kind of optimistic routing, so no DB call is added to the hot path.
2. **Landing at `/`, chat at `/chat`**. Simplest routing, but returning clients click through marketing on every visit, and existing links to `/` change meaning.
3. **Decide inside the page with a Suspense boundary**. Keeps one route file, but makes `/` dynamic for crawlers and puts a session read in front of the landing page, hurting the static shell and first paint.

## Rationale

Option 1 keeps both experiences at their best: a fully static, fast landing page for strangers and search engines, and today's workspace for clients, with the decision made before rendering and without a database round trip from Lagos to Frankfurt. The product preview reuses real components on fixtures, so it can't drift from what the app shows.

## References

- Next.js Proxy (optimistic checks): `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`
- Next.js metadata, `opengraph-image`, `robots`, `sitemap`: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/`
- Google structured data, Organization and SoftwareApplication: https://developers.google.com/search/docs/appearance/structured-data/organization
