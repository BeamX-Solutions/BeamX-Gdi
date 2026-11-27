"use client";

import { CalendarCheckIcon, CalendarIcon, CalendarXIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  calendlyEmbedUrl,
  cardView,
  consultationCopy,
  isScheduledMessage,
  POLL_FOR_MS,
  POLL_MS,
  type CardView,
  type LiveConsultation,
} from "./consultation-state";

/**
 * The strategy call card (spec 0016, AC-1, AC-3). Renders from props only, so `/design`
 * shows every state.
 */
export function ConsultationCardView({
  view,
  onBook,
}: {
  readonly view: CardView;
  readonly onBook: () => void;
}) {
  const titleId = useId();
  const Icon =
    view.kind === "booked" || view.kind === "waiting"
      ? CalendarCheckIcon
      : view.kind === "canceled"
        ? CalendarXIcon
        : CalendarIcon;
  return (
    <section
      aria-labelledby={titleId}
      data-testid="consultation-card"
      className="flex w-full min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground md:p-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p id={titleId} className="font-semibold wrap-anywhere">
            {consultationCopy.title}
          </p>
          <p className="text-sm wrap-anywhere text-muted-foreground">
            {view.kind === "offered"
              ? consultationCopy.text
              : view.kind === "waiting"
                ? consultationCopy.waiting
                : view.kind === "booked"
                  ? consultationCopy.booked(view.when)
                  : consultationCopy.canceled}
          </p>
        </div>
      </div>
      {view.kind === "offered" ? (
        <div>
          <Button onClick={onBook}>{consultationCopy.button}</Button>
        </div>
      ) : null}
    </section>
  );
}

/** The live card: the dialog with Calendly, then a short poll for the webhook. */
export function ConsultationCard({
  consultationId,
  calendlyUrl,
  initial,
  prefill,
}: {
  readonly consultationId: string;
  readonly calendlyUrl: string;
  readonly initial: LiveConsultation;
  readonly prefill: {
    readonly name: string | null;
    readonly email: string | null;
  };
}) {
  const [live, setLive] = useState(initial);
  const [open, setOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<number | null>(null);

  // A reload shows the saved state (AC-8).
  useEffect(() => {
    let stop = false;
    void readLive(consultationId).then((next) => {
      if (!stop && next) setLive(next);
    });
    return () => {
      stop = true;
    };
  }, [consultationId]);

  // Calendly posts `event_scheduled` from its iframe when the client books (AC-3).
  useEffect(() => {
    if (!open) return;
    const onMessage = (e: MessageEvent) => {
      if (!isScheduledMessage(e.origin, e.data)) return;
      setOpen(false);
      setScheduledAt(Date.now());
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open]);

  // Then poll until the webhook confirms, for up to a minute (AC-8).
  useEffect(() => {
    if (scheduledAt === null || live.status !== "offered") return;
    const timer = window.setInterval(() => {
      if (Date.now() - scheduledAt > POLL_FOR_MS) {
        window.clearInterval(timer);
        return;
      }
      void readLive(consultationId).then((next) => {
        if (next) setLive(next);
      });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [scheduledAt, live.status, consultationId]);

  const src =
    typeof window === "undefined"
      ? null
      : `${calendlyEmbedUrl(calendlyUrl, consultationId, prefill)}&embed_domain=${encodeURIComponent(window.location.host)}`;

  return (
    <>
      <ConsultationCardView
        view={cardView(live, scheduledAt !== null)}
        onBook={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[90dvh] max-w-3xl flex-col gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{consultationCopy.dialogTitle}</DialogTitle>
            <DialogDescription>{consultationCopy.dialogText}</DialogDescription>
          </DialogHeader>
          {open && src !== null ? (
            <iframe
              title={consultationCopy.dialogTitle}
              src={src}
              data-testid="calendly-frame"
              className="min-h-0 w-full flex-1 rounded-lg border bg-background"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

const readLive = async (id: string): Promise<LiveConsultation | null> => {
  try {
    const res = await fetch(`/api/consultations/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "status" in body &&
      (body.status === "offered" ||
        body.status === "booked" ||
        body.status === "canceled")
    )
      return {
        status: body.status,
        startTime:
          "startTime" in body && typeof body.startTime === "string"
            ? body.startTime
            : null,
      };
    return null;
  } catch {
    return null;
  }
};
