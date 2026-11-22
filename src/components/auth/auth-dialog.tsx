"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { authClient } from "@/auth/client";
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
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsDesktop } from "@/components/workspace/use-is-desktop";
import {
  FORFEIT_NOTE,
  RESEND_WAIT_S,
  SIGNED_IN_TOAST,
  authErrorMessage,
  checkEmail,
  checkPassword,
  checkSignUp,
  isFullCode,
  needsNewCode,
  type FieldErrors,
} from "./auth-copy";

/** Where the dialog is in its flow (spec 0009, flows 1 and 2). */
type Step =
  | { readonly kind: "sign-up" }
  | { readonly kind: "code" }
  | { readonly kind: "password" }
  | { readonly kind: "exists"; readonly googleOnly: boolean }
  | { readonly kind: "sign-in" }
  | { readonly kind: "forgot" }
  | { readonly kind: "reset" };

const TITLES: Readonly<
  Record<Step["kind"], { readonly title: string; readonly description: string }>
> = {
  "sign-up": {
    title: "Create your account",
    description: "Keep your chats and reports, and pick up where you left off.",
  },
  code: {
    title: "Check your email",
    description: "Enter the 6 digit code we sent you.",
  },
  password: {
    title: "Choose another password",
    description: "Your account is ready. Set a password to finish.",
  },
  exists: {
    title: "You already have an account",
    description: "An account with this email already exists.",
  },
  "sign-in": {
    title: "Sign in",
    description: "Welcome back. Your chats and reports come with you.",
  },
  forgot: {
    title: "Reset your password",
    description: "We'll email you a 6 digit code.",
  },
  reset: {
    title: "Choose a new password",
    description: "Enter the code we sent and your new password.",
  },
};

const postJson = async (
  url: string,
  body: unknown,
): Promise<{
  readonly ok: boolean;
  readonly data: Record<string, unknown>;
}> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { ok: response.ok, data };
};

const codeOf = (data: Record<string, unknown>): string | undefined =>
  typeof data.code === "string" ? data.code : undefined;

/**
 * Sign up and sign in (spec 0009, AC-1 to AC-8). An email account is created only when
 * the code is entered, in this tab, which links the guest; the password is set right
 * after. A dialog on desktop, a bottom sheet on phones.
 */
export function AuthDialog({
  open,
  onOpenChange,
  onSignedIn,
  initialStep = "sign-up",
  guestHasCredits = false,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Called once signed in, with the toast text. */
  readonly onSignedIn: (message: string) => void;
  readonly initialStep?: "sign-up" | "sign-in";
  /** A guest with unspent credits: the sign in form says they don't carry over (AC-7). */
  readonly guestHasCredits?: boolean;
}) {
  const isDesktop = useIsDesktop();
  const [step, setStep] = useState<Step>({ kind: initialStep });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Counts down to "Send a new code" (AC-3).
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const reset = () => {
    setStep({ kind: initialStep });
    setCode("");
    setPassword("");
    setFieldErrors({});
    setError(null);
    setBusy(false);
  };

  const close = (next: boolean) => {
    // Closing mid sign up after the account exists would leave it without a password,
    // so the password step can't be dismissed (AC-2).
    if (!next && step.kind === "password") return;
    if (!next) reset();
    onOpenChange(next);
  };

  const finish = () => {
    reset();
    onOpenChange(false);
    onSignedIn(SIGNED_IN_TOAST);
  };

  const sendCode = async (): Promise<boolean> => {
    const sent = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: "sign-in",
    });
    if (sent.error) {
      setError(authErrorMessage(sent.error.code));
      return false;
    }
    setResendIn(RESEND_WAIT_S);
    return true;
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

  const submitSignUp = (event: FormEvent) => {
    event.preventDefault();
    const errors = checkSignUp({ name, email, password });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    void run(async () => {
      const check = await postJson("/api/account/email-check", {
        email: email.trim(),
      });
      if (!check.ok) return setError(authErrorMessage(codeOf(check.data)));
      if (check.data.status !== "none")
        return setStep({
          kind: "exists",
          googleOnly: check.data.status === "google_only",
        });
      if (await sendCode()) {
        setCode("");
        setStep({ kind: "code" });
      }
    });
  };

  const setAccountPassword = async (): Promise<boolean> => {
    const result = await postJson("/api/account/set-password", { password });
    if (result.ok) return true;
    setStep({ kind: "password" });
    setPassword("");
    setError(authErrorMessage(codeOf(result.data)));
    return false;
  };

  const submitCode = (event?: FormEvent) => {
    event?.preventDefault();
    if (!isFullCode(code)) return setError("Enter the 6 digit code.");
    void run(async () => {
      // Creates the account (verified), signs in and links the guest (spec 0009).
      const signedIn = await authClient.signIn.emailOtp({
        email: email.trim(),
        otp: code,
        name: name.trim(),
      });
      if (signedIn.error) {
        setCode("");
        // An expired or used up code can't be retried: offer a new one now (AC-3).
        if (needsNewCode(signedIn.error.code)) setResendIn(0);
        return setError(authErrorMessage(signedIn.error.code));
      }
      if (await setAccountPassword()) finish();
    });
  };

  const submitNewPassword = (event: FormEvent) => {
    event.preventDefault();
    const problem = checkPassword(password);
    setFieldErrors(problem ? { password: problem } : {});
    if (problem) return;
    void run(async () => {
      if (await setAccountPassword()) finish();
    });
  };

  const submitSignIn = (event: FormEvent) => {
    event.preventDefault();
    const problem =
      checkEmail(email) ?? (password.length === 0 ? "" : undefined);
    if (problem !== undefined)
      return setError(problem || "Enter your password.");
    void run(async () => {
      const signedIn = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (signedIn.error)
        return setError(authErrorMessage(signedIn.error.code));
      finish();
    });
  };

  const startReset = (event: FormEvent) => {
    event.preventDefault();
    const problem = checkEmail(email);
    if (problem) return setError(problem);
    void run(async () => {
      // Silent for an unknown email, so it never says whether an account exists (AC-10).
      const sent = await authClient.emailOtp.requestPasswordReset({
        email: email.trim(),
      });
      if (sent.error) return setError(authErrorMessage(sent.error.code));
      setCode("");
      setPassword("");
      setResendIn(RESEND_WAIT_S);
      setStep({ kind: "reset" });
    });
  };

  const resendReset = () =>
    void run(async () => {
      const sent = await authClient.emailOtp.requestPasswordReset({
        email: email.trim(),
      });
      if (sent.error) return setError(authErrorMessage(sent.error.code));
      setCode("");
      setResendIn(RESEND_WAIT_S);
    });

  const submitReset = (event: FormEvent) => {
    event.preventDefault();
    if (!isFullCode(code)) return setError("Enter the 6 digit code.");
    const problem = checkPassword(password);
    setFieldErrors(problem ? { password: problem } : {});
    if (problem) return;
    void run(async () => {
      // Resets and signs out every session of the user (AC-10), then signs in here.
      const reset = await authClient.emailOtp.resetPassword({
        email: email.trim(),
        otp: code,
        password,
      });
      if (reset.error) {
        setCode("");
        if (needsNewCode(reset.error.code)) setResendIn(0);
        return setError(authErrorMessage(reset.error.code));
      }
      const signedIn = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (signedIn.error)
        return setError(authErrorMessage(signedIn.error.code));
      finish();
    });
  };

  const { title, description } = TITLES[step.kind];
  const body = (
    <div className="flex flex-col gap-4">
      {step.kind === "sign-up" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={submitSignUp}
          noValidate
        >
          <Field id="auth-name" label="First name" error={fieldErrors.name}>
            <Input
              id="auth-name"
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={
                fieldErrors.name ? "auth-name-error" : undefined
              }
            />
          </Field>
          <Field id="auth-email" label="Email" error={fieldErrors.email}>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={
                fieldErrors.email ? "auth-email-error" : undefined
              }
            />
          </Field>
          <Field
            id="auth-password"
            label="Password"
            hint="At least 8 characters."
            error={fieldErrors.password}
          >
            <Input
              id="auth-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={
                fieldErrors.password
                  ? "auth-password-error"
                  : "auth-password-hint"
              }
            />
          </Field>
          <ErrorText error={error} />
          <Button type="submit" disabled={busy}>
            {busy ? "Sending code…" : "Continue"}
          </Button>
          <SwitchLink
            prompt="Already have an account?"
            action="Sign in"
            onClick={() => {
              setError(null);
              setStep({ kind: "sign-in" });
            }}
          />
        </form>
      ) : null}

      {step.kind === "code" ? (
        <form className="flex flex-col gap-4" onSubmit={submitCode} noValidate>
          <p className="text-sm text-muted-foreground">
            Sent to <span className="font-medium text-foreground">{email}</span>
            . It expires in 10 minutes.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="auth-code">Code</Label>
            <InputOTP
              id="auth-code"
              maxLength={6}
              inputMode="numeric"
              pattern="^[0-9]*$"
              autoComplete="one-time-code"
              value={code}
              onChange={setCode}
              aria-describedby={error ? "auth-error" : undefined}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <ErrorText error={error} />
          <Button type="submit" disabled={busy || !isFullCode(code)}>
            {busy ? "Checking…" : "Create account"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || resendIn > 0}
            onClick={() =>
              void run(async () => {
                if (await sendCode()) setCode("");
              })
            }
          >
            {resendIn > 0
              ? `Send a new code in ${resendIn}s`
              : "Send a new code"}
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setError(null);
              setStep({ kind: "sign-up" });
            }}
          >
            Use a different email
          </Button>
        </form>
      ) : null}

      {step.kind === "password" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={submitNewPassword}
          noValidate
        >
          <Field
            id="auth-new-password"
            label="New password"
            hint="At least 8 characters."
            error={fieldErrors.password}
          >
            <Input
              id="auth-new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={
                fieldErrors.password
                  ? "auth-new-password-error"
                  : "auth-new-password-hint"
              }
            />
          </Field>
          <ErrorText error={error} />
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Set password"}
          </Button>
        </form>
      ) : null}

      {step.kind === "exists" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {step.googleOnly
              ? "This email was used with Google. Google sign in is coming soon; for now, use Forgot password to add a password."
              : "Sign in with your password instead."}
          </p>
          <Button
            type="button"
            onClick={() => {
              setPassword("");
              setError(null);
              setStep({ kind: "sign-in" });
            }}
          >
            Sign in instead
          </Button>
        </div>
      ) : null}

      {step.kind === "sign-in" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={submitSignIn}
          noValidate
        >
          {guestHasCredits ? (
            <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
              {FORFEIT_NOTE}
            </p>
          ) : null}
          <Field id="auth-signin-email" label="Email">
            <Input
              id="auth-signin-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field id="auth-signin-password" label="Password">
            <Input
              id="auth-signin-password"
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
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setError(null);
              setStep({ kind: "forgot" });
            }}
          >
            Forgot password?
          </Button>
          <SwitchLink
            prompt="New to BeamX?"
            action="Create an account"
            onClick={() => {
              setError(null);
              setStep({ kind: "sign-up" });
            }}
          />
        </form>
      ) : null}
      {step.kind === "forgot" ? (
        <form className="flex flex-col gap-4" onSubmit={startReset} noValidate>
          <Field id="auth-forgot-email" label="Email">
            <Input
              id="auth-forgot-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <ErrorText error={error} />
          <Button type="submit" disabled={busy}>
            {busy ? "Sending code…" : "Send code"}
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setError(null);
              setStep({ kind: "sign-in" });
            }}
          >
            Back to sign in
          </Button>
        </form>
      ) : null}

      {step.kind === "reset" ? (
        <form className="flex flex-col gap-4" onSubmit={submitReset} noValidate>
          <p className="text-sm text-muted-foreground">
            If an account uses{" "}
            <span className="font-medium text-foreground">{email}</span>, a code
            is on its way. It expires in 10 minutes.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="auth-reset-code">Code</Label>
            <InputOTP
              id="auth-reset-code"
              maxLength={6}
              inputMode="numeric"
              pattern="^[0-9]*$"
              autoComplete="one-time-code"
              value={code}
              onChange={setCode}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Field
            id="auth-reset-password"
            label="New password"
            hint="At least 8 characters."
            error={fieldErrors.password}
          >
            <Input
              id="auth-reset-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={
                fieldErrors.password
                  ? "auth-reset-password-error"
                  : "auth-reset-password-hint"
              }
            />
          </Field>
          <ErrorText error={error} />
          <Button type="submit" disabled={busy || !isFullCode(code)}>
            {busy ? "Saving…" : "Reset password"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || resendIn > 0}
            onClick={resendReset}
          >
            {resendIn > 0
              ? `Send a new code in ${resendIn}s`
              : "Send a new code"}
          </Button>
        </form>
      ) : null}
    </div>
  );

  if (isDesktop)
    return (
      <Dialog open={open} onOpenChange={close}>
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={step.kind !== "password"}
        >
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

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The dialog's one error line, read out when it appears. */
function ErrorText({ error }: { readonly error: string | null }) {
  return error ? (
    <p id="auth-error" role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

function SwitchLink({
  prompt,
  action,
  onClick,
}: {
  readonly prompt: string;
  readonly action: string;
  readonly onClick: () => void;
}) {
  return (
    <p className="text-center text-sm text-muted-foreground">
      {prompt}{" "}
      <button
        type="button"
        className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
        onClick={onClick}
      >
        {action}
      </button>
    </p>
  );
}
