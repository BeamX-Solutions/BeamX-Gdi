"use client";

import { DownloadIcon, MailIcon } from "lucide-react";
import { useId, useState } from "react";
import { useAuthOpen } from "@/components/auth/auth-open-context";
import { Button } from "@/components/ui/button";
import { shareCopy, type ShareState } from "./report-share-state";

type ReportShareViewProps = {
  readonly pdfHref: string;
  readonly guest: boolean;
  readonly state: ShareState;
  readonly onEmail: () => void;
  readonly onSignUp: () => void;
};

/**
 * Download PDF and Email me this report under a ready report (spec 0015, AC-6). Renders
 * from props only, so `/design` shows every state. A guest sees a sign up line in place
 * of the email button, since only an account has a verified address.
 */
export function ReportShareView({
  pdfHref,
  guest,
  state,
  onEmail,
  onSignUp,
}: ReportShareViewProps) {
  const note = shareCopy.note(state);
  // Read with the focused email button; the thread owns the only live region.
  const noteId = useId();
  return (
    <section
      aria-label={shareCopy.label}
      data-testid="report-share"
      className="flex min-w-0 flex-col gap-3 border-t pt-6"
    >
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <a href={pdfHref} download>
            <DownloadIcon aria-hidden />
            {shareCopy.download}
          </a>
        </Button>
        {guest ? null : (
          <Button
            variant="outline"
            onClick={onEmail}
            disabled={state.kind === "sending"}
            aria-describedby={note === "" ? undefined : noteId}
          >
            <MailIcon aria-hidden />
            {state.kind === "sending" ? shareCopy.sending : shareCopy.email}
          </Button>
        )}
      </div>
      {guest ? (
        <p className="text-sm wrap-anywhere text-muted-foreground">
          {shareCopy.guestLead}{" "}
          <button
            type="button"
            onClick={onSignUp}
            className="font-medium text-primary underline underline-offset-4"
          >
            {shareCopy.guestAction}
          </button>
        </p>
      ) : null}
      <p
        id={noteId}
        hidden={note === ""}
        className={
          state.kind === "failed"
            ? "text-sm wrap-anywhere text-destructive"
            : "text-sm wrap-anywhere text-muted-foreground"
        }
      >
        {note}
      </p>
    </section>
  );
}

/** The live share row for a run: POSTs the email and keeps its state. */
export function ReportShare({
  runId,
  guest,
}: {
  readonly runId: string;
  readonly guest: boolean;
}) {
  const auth = useAuthOpen();
  const [state, setState] = useState<ShareState>({ kind: "idle" });
  const email = async () => {
    setState({ kind: "sending" });
    try {
      const res = await fetch(`/api/runs/${runId}/email`, { method: "POST" });
      const body: unknown = await res.json().catch(() => null);
      setState(shareStateOf(res.status, body));
    } catch {
      setState({ kind: "failed", reason: "send" });
    }
  };
  return (
    <ReportShareView
      pdfHref={`/api/runs/${runId}/pdf`}
      guest={guest}
      state={state}
      onEmail={() => void email()}
      onSignUp={() => auth?.openAuth("sign-up")}
    />
  );
}

/** The share state from the email route's reply. */
const shareStateOf = (status: number, body: unknown): ShareState => {
  if (
    status === 200 &&
    typeof body === "object" &&
    body !== null &&
    "sentTo" in body &&
    typeof body.sentTo === "string"
  )
    return { kind: "sent", sentTo: body.sentTo };
  if (status === 429) return { kind: "failed", reason: "limit" };
  return { kind: "failed", reason: "send" };
};
