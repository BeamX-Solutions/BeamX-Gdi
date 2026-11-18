import Link from "next/link";
import {
  CloudAlertIcon,
  GaugeIcon,
  UserRoundPlusIcon,
  WifiOffIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export type ErrorKind = "ai_error" | "network" | "limit_reached" | "spend_cap";

type ErrorAction =
  | { readonly label: string; readonly onAction: () => void }
  | { readonly label: string; readonly href: string };

type ErrorCardProps = {
  readonly kind: ErrorKind;
  readonly title: string;
  readonly message: string;
  /** Exactly one primary action. */
  readonly action: ErrorAction;
};

const kindIcon: Readonly<Record<ErrorKind, LucideIcon>> = {
  ai_error: CloudAlertIcon,
  network: WifiOffIcon,
  limit_reached: UserRoundPlusIcon,
  spend_cap: GaugeIcon,
};

/**
 * Every expected failure, shown inline in the thread or the report panel. Neutral surface,
 * destructive accents (never verdict colors), a short message, and one action. It is not a
 * live region: the Thread owns the one live region, so the caller sets the thread status
 * when a failure should be spoken.
 */
export function ErrorCard({ kind, title, message, action }: ErrorCardProps) {
  const Icon = kindIcon[kind];
  return (
    <section
      data-error-kind={kind}
      aria-label={title}
      className="flex w-full min-w-0 flex-col gap-3 rounded-xl border border-destructive/40 bg-card p-4 text-card-foreground md:p-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold wrap-anywhere">{title}</p>
          <p className="text-sm wrap-anywhere text-muted-foreground">
            {message}
          </p>
        </div>
      </div>
      {"href" in action ? (
        <Button asChild className="self-start">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : (
        <Button className="self-start" onClick={action.onAction}>
          {action.label}
        </Button>
      )}
    </section>
  );
}
