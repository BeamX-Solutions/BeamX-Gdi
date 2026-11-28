import { PRIVACY_PATH, TERMS_PATH } from "@/legal/config";
import { cn } from "@/lib/utils";

const linkClass =
  "font-medium text-foreground underline underline-offset-2 hover:text-primary";

/**
 * "<lead> our Terms and Privacy notice." (spec 0017, AC-4). The links open in a new tab,
 * so reading them never loses a chat or a half filled form.
 */
export function PolicyNotice({
  lead,
  className,
}: {
  /** For example "By chatting you agree to". */
  readonly lead: string;
  readonly className?: string;
}) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {lead} our{" "}
      <a
        href={TERMS_PATH}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        Terms
      </a>{" "}
      and{" "}
      <a
        href={PRIVACY_PATH}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        Privacy notice
      </a>
      .
    </p>
  );
}
