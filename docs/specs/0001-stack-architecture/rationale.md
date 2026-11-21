# 0001. Stack and architecture: rationale

## Context

> ⚠️ Premise note: The four tools are being rebuilt inside the workspace while their standalone versions keep running. That means two copies of each tool's scoring and report logic, and they will drift the first time someone tunes one and forgets the other. The rebuild is still the right call for a single consistent product (the alternative is bridging two Python services, two web apps, and several AI providers). The guard is to port from source, keep scoring as pure functions, and lock parity with golden fixture tests captured from the originals.

BeamX runs four standalone business tools (Beacon, Beacon Pro, Luna, Stellar) on different stacks: two Python services, two web apps, different AI providers, separate databases. The workspace puts all four behind one AI chat. A client says what they want, the assistant runs the right tool through answer cards, shows the report beside the chat, then discusses it. It is free and acts as a lead funnel toward a BeamX consultation. The engineer chose to rebuild the tools' functionality inside the workspace, ported from their source code, with an easy way to add more tools later.

Forces:
- **Team**: small, strongest in TypeScript, no dedicated ops.
- **Scale**: under 1k tool runs a month in year one. Cost and simplicity matter more than throughput.
- **Product shape**: streaming AI chat, a live report panel, guest first use that later becomes an account, PDF and email later, file upload later, a server rendered public landing page for SEO.
- **Cost exposure**: guests trigger paid AI calls with no sign up, so abuse directly costs money.
- **Compliance**: business data from Nigerian clients (NDPA 2023) and clients abroad (GDPR). Export and delete must be possible, and the storage region and any transfer abroad must be disclosed.
- **Delivery**: Tracer Bullet. Slice 1 (Stellar end to end) must run through every layer early, so the stack has to be standing in days, not weeks.

Not deciding blocks every other foundation: data model, design system, tool layer, and assistant brain all depend on the language, framework, and data store.

## Options considered

Compared as whole stacks.

### Option 1: Next.js modular monolith on Vercel + Neon

One Next.js 16 app (UI, route handlers, AI orchestration, tool modules), Vercel AI SDK with Claude, Neon Postgres with Drizzle, Better Auth, Vercel hosting.

**Pros**: one language and one deploy; the AI SDK's chat streaming and tool calling are built for this framework; serverless free tiers fit the scale; preview deploys get branch databases; guest accounts come from the auth library.
**Cons**: Vercel lock in; serverless time limits for long reports; Drizzle still pre 1.0.

### Option 2: Next.js frontend + Python (FastAPI) backend

Keep tool logic in Python close to the originals, with a TypeScript chat UI.

**Pros**: porting the two Python tools is closer to a copy; Python's data libraries are available for scoring.
**Cons**: two languages, two deploys, a typed API boundary to maintain, and the team's strength is TypeScript. Two of the four tools are web apps that would be ported into Python anyway.

### Option 3: Supabase as the backend platform + Next.js

Supabase for Postgres, auth (with anonymous sign in), storage, and edge functions.

**Pros**: one vendor covers DB, auth, and storage; row level security in the database.
**Cons**: free projects pause after a week idle (bad for a lead funnel); business logic splits between edge functions and the app; less control over the guest to account data move.

### Option 4: Containerized Node app on a VPS or Fly

Same TypeScript app as Option 1, run as a long lived container with self managed Postgres or a managed DB.

**Pros**: no function time limits, persistent connections, lowest lock in.
**Cons**: the team operates servers, scaling, TLS, and deploys; no preview environments out of the box; more work before the first tracer bullet.

## Rationale

Option 1 matches every force: the team's language, a scale where serverless free tiers are plenty, and a product (streaming chat with tool calling) that the AI SDK and Next.js are purpose built for. It also keeps the Tracer Bullet short, since auth with guests, a DB with preview branches, and streaming are each one install away. Option 2 only pays off if most tool logic stays in Python, but two of the four tools are already web apps and the team writes TypeScript, so the second language is pure overhead. Option 3 is close, but idle pausing hurts a funnel, and keeping all logic in one app (with Better Auth's `onLinkAccount` for the guest data move) is simpler than splitting it across edge functions. Option 4 trades a real ops burden for limits the product does not hit yet. If a report ever outgrows a streamed request, Inngest moves that step off the request without leaving the platform.

Smaller calls made during the walk (engineer picked each; runner up in brackets): tools as code modules with a registry [config in DB]; one AI provider, Claude [Vercel AI Gateway with mixed models]; inline streaming now and Inngest in slice 5 [Inngest from day one]; Resend [Postmark]; `@react-pdf/renderer` [headless Chromium]; Vercel Blob [Cloudflare R2]; rate limit plus bot check [rate limit only]; Frankfurt region [US East]; Vercel logs only [Sentry]; pnpm with Node 24 [npm].

Calls made at write time: Zod for all validation and env checks [Valibot, smaller but less ecosystem support]; Vercel BotID as the bot check [Cloudflare Turnstile, which adds a visible widget and another vendor]; Neon serverless driver with the pooled connection [node-postgres, which suits long lived servers]; route handlers for chat and Server Actions for mutations, no public API [tRPC, unneeded with one client].

### Update 2026-11-22: Vercel Hobby for now

The team runs on Vercel Hobby, not Pro. The cost of Pro buys little before launch: the only hard limit that bites is the 300 second function cap, and the standalone Luna already lives with it by generating its five phase plan as five calls (each POST runs the next unsaved phase and returns 202 until the plan is done). The workspace's report runner already saves each phase and skips saved phases on retry (spec 0005, AC-8), so the same split costs little here: one phase per call instead of all phases in one `after()`. Chaining on the server is preferred over Luna's browser driven loop, so a closed tab does not stop a paid report. What Hobby does not settle is its terms: commercial use is not allowed, so Pro stays owed before the commercial launch.

## References

**Project sources**:
- `docs/scope/scope.md`: product intent, Tracer Bullet approach, Beta tier on this feature, compliance note (NDPA, GDPR)
- Engineer's answers in the design conversation (2026-11-17)

**Practices & standards**:
- Monolith first for small teams
- Relational database as the default store
- Use a proven auth library, never roll your own
- Golden fixture parity tests when porting logic between systems

**Links** (web checked on 2026-11-17):
- Next.js 16.4 release: https://nextjs.org/blog/next-16-4
- AI SDK 7 announcement: https://vercel.com/changelog/ai-sdk-7
- Neon pricing: https://neon.com/pricing
- Supabase pricing: https://supabase.com/pricing
- Better Auth anonymous plugin: https://www.better-auth.com/docs/plugins/anonymous

### Landscape scan (2026-11-17)

- Next.js 16.4 (2026-10-06) ships React 19.3. Cache Components are recommended now and become the default in 17. Security patches are frequent, so pin the latest patch.
- AI SDK 7.0 (2026-06-25): ESM only, Node 22+, adds durable `WorkflowAgent`.
- Neon free tier: 100 CU hours and 1 GB per project. Supabase free tier: 500 MB, pauses after 1 week idle.
- Drizzle: 0.45.x is the stable `latest`, v1 is still a release candidate. Prisma 7 is stable.
- Auth.js is now maintained by the Better Auth team. Better Auth is the greenfield path.
- Not verified: Vercel Workflow GA status, Trigger.dev and Inngest versions, Resend version.
