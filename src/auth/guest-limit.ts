/**
 * The guest per IP cap on `POST /api/auth/sign-in/anonymous` (spec 0008, AC-8). An IP
 * that already started `LIMIT_GUESTS_PER_IP` guests this Lagos day gets
 * `429 {"code":"guest_limit"}` and no guest is made. A sign in counts only when Better
 * Auth answers `200`. With no IP the cap is skipped (never one shared bucket), and a
 * Redis error allows (the store fails open, AC-9).
 */
import type { GuestGuard } from "@/lib/limits";

export type GuestLimitDeps = {
  readonly guard: GuestGuard;
  readonly max: number;
  /** Keeps the count alive after the response (Next's `after`). */
  readonly waitUntil: (task: Promise<unknown>) => void;
  readonly log: (
    event: string,
    fields: Readonly<Record<string, string | number | boolean | null>>,
  ) => void;
};

export const GUEST_LIMIT_BODY = { code: "guest_limit" } as const;

export const limitGuestSignIn = async (
  deps: GuestLimitDeps,
  ip: string | null,
  signIn: () => Promise<Response>,
): Promise<Response> => {
  if (ip === null) return signIn();
  // Same rule as `overLimit`: with a limit of 30, a count of 30 refuses the 31st.
  if ((await deps.guard.read(ip)) >= deps.max) {
    deps.log("guest_limit", {});
    return Response.json(GUEST_LIMIT_BODY, {
      status: 429,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const response = await signIn();
  if (response.status === 200) deps.waitUntil(deps.guard.count(ip));
  return response;
};
