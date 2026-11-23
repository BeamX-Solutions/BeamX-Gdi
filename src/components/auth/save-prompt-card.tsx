import { BookmarkIcon } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
  SAVE_PROMPT_DISMISS,
  SAVE_PROMPT_TEXT,
  SAVE_PROMPT_TITLE,
  SIGN_UP_LABEL,
} from "./auth-copy";

/**
 * The save prompt after a guest's report is ready (spec 0009, AC-1): Sign up opens the
 * auth dialog on sign up, Not now hides it for this chat. Renders from props only.
 */
export function SavePromptCard({
  onSignUp,
  onDismiss,
}: {
  readonly onSignUp: () => void;
  readonly onDismiss: () => void;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex w-full min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground md:p-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <BookmarkIcon
          className="mt-0.5 size-5 shrink-0 text-primary"
          aria-hidden
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p id={titleId} className="font-semibold wrap-anywhere">
            {SAVE_PROMPT_TITLE}
          </p>
          <p className="text-sm wrap-anywhere text-muted-foreground">
            {SAVE_PROMPT_TEXT}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onSignUp}>{SIGN_UP_LABEL}</Button>
        <Button variant="outline" onClick={onDismiss}>
          {SAVE_PROMPT_DISMISS}
        </Button>
      </div>
    </section>
  );
}
