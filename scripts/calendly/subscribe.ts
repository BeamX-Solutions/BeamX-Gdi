/**
 * `pnpm calendly:subscribe [--url <webhook url>] [--yes]` (spec 0016, AC-10): creates
 * Calendly's organization webhook subscription for `invitee.created` and
 * `invitee.canceled`, signed with `CALENDLY_WEBHOOK_SIGNING_KEY`. Staff only, once per
 * environment. Needs `CALENDLY_API_TOKEN` (a personal access token) and a Calendly plan
 * with webhooks (Standard or higher). The URL defaults to
 * `<NEXT_PUBLIC_APP_URL>/api/webhooks/calendly`. Shows what it will do and asks first.
 */
import { env } from "@/lib/env";
import { confirm } from "../credits/confirm";

const API = "https://api.calendly.com";

const argValue = (args: readonly string[], name: string): string | null => {
  const at = args.indexOf(name);
  return at >= 0 ? (args[at + 1] ?? null) : null;
};

const main = async (): Promise<number> => {
  const args = process.argv.slice(2);
  const token = env.CALENDLY_API_TOKEN;
  const signingKey = env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (token === undefined || signingKey === undefined) {
    console.error(
      "Set CALENDLY_API_TOKEN and CALENDLY_WEBHOOK_SIGNING_KEY first (see .env.example).",
    );
    return 2;
  }
  const url =
    argValue(args, "--url") ??
    `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/webhooks/calendly`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const me = await fetch(`${API}/users/me`, { headers });
  if (!me.ok) {
    console.error(`Calendly refused the token (${me.status}).`);
    return 1;
  }
  const meBody = (await me.json()) as {
    resource?: { current_organization?: string };
  };
  const organization = meBody.resource?.current_organization;
  if (!organization) {
    console.error("Calendly did not return an organization for this token.");
    return 1;
  }

  console.log(
    `Create a webhook subscription:\n  url: ${url}\n  events: invitee.created, invitee.canceled\n  organization: ${organization}`,
  );
  if (!args.includes("--yes") && !(await confirm("Create it?"))) {
    console.log("Cancelled, nothing created.");
    return 1;
  }
  const res = await fetch(`${API}/webhook_subscriptions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url,
      events: ["invitee.created", "invitee.canceled"],
      organization,
      scope: "organization",
      signing_key: signingKey,
    }),
  });
  if (!res.ok) {
    // Calendly says why (an existing subscription for this URL, a plan without webhooks).
    console.error(`Calendly refused (${res.status}): ${await res.text()}`);
    return 1;
  }
  console.log(
    "Created. Bookings made in the chat now confirm through this webhook.",
  );
  return 0;
};

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : "failed");
    process.exit(1);
  },
);
