import { CircleAlertIcon, CircleCheckIcon, ClockIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A status line at the top of `/credits` (spec 0004): the outcome of a checkout (AC-13,
 * AC-21) or the expiry warning (AC-15). `error` and `warn` use destructive accents,
 * `ok` the primary color; the icon always comes with a title, never color alone.
 */
export function CreditsBanner({
  tone,
  title,
  message,
  testId,
}: {
  readonly tone: "ok" | "warn" | "error";
  readonly title: string;
  readonly message: string;
  readonly testId?: string;
}) {
  const Icon =
    tone === "ok"
      ? CircleCheckIcon
      : tone === "warn"
        ? ClockIcon
        : CircleAlertIcon;
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-xl border bg-card p-4 text-card-foreground",
        tone !== "ok" && "border-destructive/40",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-5 shrink-0",
          tone === "ok" ? "text-primary" : "text-destructive",
        )}
        aria-hidden
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold wrap-anywhere">{title}</p>
        <p className="text-sm wrap-anywhere text-muted-foreground">{message}</p>
      </div>
    </section>
  );
}
