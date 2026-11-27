"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AnswerCard } from "@/components/answer-cards/answer-card";
import type { AnswerValue } from "@/components/answer-cards/types";
import { Button } from "@/components/ui/button";
import type { ProfileRow } from "./profile-rows";

type ProfileListProps = {
  readonly rows: readonly ProfileRow[];
  /** Saves an edit; resolves false when the server refused the value. */
  readonly onSave: (key: string, value: AnswerValue) => Promise<boolean>;
  readonly onRemove: (key: string) => Promise<void>;
};

/**
 * The business profile (spec 0012, AC-8): each fact with where it came from, edited
 * with the matching answer card or removed. Renders from props only, so `/design`
 * shows it on fixtures.
 */
export function ProfileList({ rows, onSave, onRemove }: ProfileListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (rows.length === 0)
    return (
      <section className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground md:p-5">
        <p className="font-semibold">Nothing saved yet</p>
        <p className="text-sm text-muted-foreground">
          Run a BeamX tool, like the Beacon health check, and what you tell it
          about your business is kept here, so the next tool does not ask again.
        </p>
      </section>
    );

  return (
    <ul
      className="flex min-w-0 flex-col divide-y rounded-xl border bg-card text-card-foreground"
      data-testid="profile-list"
    >
      {rows.map((row) => (
        <li key={row.key} className="flex min-w-0 flex-col gap-3 p-4 md:p-5">
          {editing === row.key ? (
            <div className="flex min-w-0 flex-col gap-2">
              <AnswerCard
                question={row.question}
                {...(row.initialValue === null
                  ? {}
                  : { initialValue: row.initialValue })}
                disabled={pending}
                onSubmit={(value) =>
                  startTransition(async () => {
                    const saved = await onSave(row.key, value);
                    setRefused(saved ? null : row.key);
                    if (saved) {
                      setEditing(null);
                      router.refresh();
                    }
                  })
                }
              />
              {refused === row.key ? (
                <p role="alert" className="text-sm text-destructive">
                  That answer could not be saved. Check it and try again.
                </p>
              ) : null}
              <Button
                variant="ghost"
                className="self-start"
                disabled={pending}
                onClick={() => {
                  setEditing(null);
                  setRefused(null);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm text-muted-foreground">{row.label}</p>
                <p className="font-medium wrap-anywhere">{row.value}</p>
                <p className="text-xs text-muted-foreground">{row.origin}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${row.label}`}
                disabled={pending}
                onClick={() => setEditing(row.key)}
              >
                <PencilIcon aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${row.label}`}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await onRemove(row.key);
                    router.refresh();
                  })
                }
              >
                <Trash2Icon aria-hidden />
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
