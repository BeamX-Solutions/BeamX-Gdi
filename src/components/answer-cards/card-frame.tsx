"use client";

import { HelpCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { progressLabel } from "./progress-label";
import type { QuestionProgress } from "./types";

type CardFrameProps = {
  readonly promptId: string;
  readonly prompt: string;
  readonly help?: string;
  readonly progress?: QuestionProgress;
  readonly children: ReactNode;
};

/** The shared shell of every answer card: progress line, prompt, help toggle, then the controls. */
export function CardFrame({
  promptId,
  prompt,
  help,
  progress,
  children,
}: CardFrameProps) {
  return (
    <div
      role="group"
      aria-labelledby={promptId}
      className="flex w-full min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground md:p-5"
    >
      {progress ? (
        <p className="text-sm text-muted-foreground">
          {progressLabel(progress)}
        </p>
      ) : null}
      <p id={promptId} className="text-lg font-semibold wrap-anywhere">
        {prompt}
      </p>
      {help ? (
        <Collapsible className="flex flex-col">
          <CollapsibleTrigger className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-md text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            <HelpCircleIcon className="size-4" aria-hidden />
            What does this mean?
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="rounded-lg bg-muted p-3 text-sm wrap-anywhere text-foreground">
              {help}
            </p>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      {children}
    </div>
  );
}
