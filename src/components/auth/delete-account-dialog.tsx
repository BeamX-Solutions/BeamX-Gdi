"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { authClient } from "@/auth/client";
import { SESSION_EXPIRED, typedEmailMatches } from "@/auth/delete-account";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { queueNotice } from "@/components/workspace/notice-context";
import { useIsDesktop } from "@/components/workspace/use-is-desktop";
import {
  DELETED_TOAST,
  DELETE_ACTION,
  DELETE_CONFIRM_LABEL,
  DELETE_DESCRIPTION,
  DELETE_LOSSES,
  DELETE_TITLE,
  REAUTH_DESCRIPTION,
  REAUTH_SIGN_OUT_HINT,
  REAUTH_TITLE,
  authErrorMessage,
  deleteErrorMessage,
} from "./auth-copy";
import { ErrorText, Field } from "./auth-dialog";

type Step = "confirm" | "reauth";

/** A full page load to `/`, so nothing of the account stays in the router cache. */
const goHome = () => {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/");
};

/**
 * Delete account (spec 0009, AC-13): names what is lost, asks for the account's email,
 * and deletes. A session older than a day gets a sign in again step first (Better Auth's
 * fresh session rule). A dialog on desktop, a bottom sheet on phones.
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The signed in account's email, the one the user must type. */
  readonly email: string;
}) {
  const isDesktop = useIsDesktop();
  const [step, setStep] = useState<Step>("confirm");
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setStep("confirm");
      setTyped("");
      setPassword("");
      setError(null);
    }
    onOpenChange(next);
  };

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch {
      setError(authErrorMessage(undefined));
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = (event: FormEvent) => {
    event.preventDefault();
    if (!typedEmailMatches(typed, email))
      return setError(deleteErrorMessage("email_mismatch"));
    void run(async () => {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: typed.trim() }),
      });
      if (response.ok) {
        queueNotice(DELETED_TOAST);
        return goHome();
      }
      const data = (await response.json().catch(() => ({}))) as {
        code?: unknown;
      };
      const code = typeof data.code === "string" ? data.code : undefined;
      if (code === SESSION_EXPIRED) {
        setPassword("");
        return setStep("reauth");
      }
      setError(deleteErrorMessage(code));
    });
  };

  const submitReauth = (event: FormEvent) => {
    event.preventDefault();
    if (password.length === 0) return setError("Enter your password.");
    void run(async () => {
      // A new sign in starts a fresh session, so the delete is allowed again.
      const signedIn = await authClient.signIn.email({ email, password });
      if (signedIn.error)
        return setError(authErrorMessage(signedIn.error.code));
      setPassword("");
      setStep("confirm");
    });
  };

  const signOut = () =>
    void run(async () => {
      await authClient.signOut();
      goHome();
    });

  const title = step === "confirm" ? DELETE_TITLE : REAUTH_TITLE;
  const description =
    step === "confirm" ? DELETE_DESCRIPTION : REAUTH_DESCRIPTION;

  const body: ReactNode =
    step === "confirm" ? (
      <form className="flex flex-col gap-4" onSubmit={submitDelete} noValidate>
        <ul className="list-disc pl-5 text-sm text-foreground">
          {DELETE_LOSSES.map((loss) => (
            <li key={loss}>{loss}</li>
          ))}
        </ul>
        <Field id="delete-email" label={DELETE_CONFIRM_LABEL} hint={email}>
          <Input
            id="delete-email"
            type="email"
            autoComplete="off"
            inputMode="email"
            aria-describedby="delete-email-hint"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </Field>
        <ErrorText error={error} />
        <Button type="submit" variant="destructive" disabled={busy}>
          {busy ? "Deleting…" : DELETE_ACTION}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => close(false)}
        >
          Cancel
        </Button>
      </form>
    ) : (
      <form className="flex flex-col gap-4" onSubmit={submitReauth} noValidate>
        <Field id="reauth-email" label="Email">
          <Input id="reauth-email" type="email" value={email} readOnly />
        </Field>
        <Field id="reauth-password" label="Password">
          <Input
            id="reauth-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorText error={error} />
        <Button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-sm text-muted-foreground">{REAUTH_SIGN_OUT_HINT}</p>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={signOut}
        >
          Sign out
        </Button>
      </form>
    );

  if (isDesktop)
    return (
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    );

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto px-4 pb-6"
      >
        <SheetHeader className="px-0">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}
