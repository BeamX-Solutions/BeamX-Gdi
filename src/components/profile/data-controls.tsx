"use client";

import { DownloadIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { DELETE_LABEL } from "@/components/auth/auth-copy";
import { DeleteAccountDialog } from "@/components/auth/delete-account-dialog";
import {
  DOWNLOAD_LABEL,
  downloadMyData,
} from "@/components/auth/download-data";
import { Button } from "@/components/ui/button";

/**
 * "Your data" on the profile page (spec 0017, AC-8): Download my data for anyone with a
 * session, and Delete account for an account. The result of a download shows in a status
 * line, since this page has no toast.
 */
export function DataControls({
  email,
}: {
  /** The account's email for the delete dialog; null for a guest (no delete). */
  readonly email: string | null;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground md:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Your data</h2>
        <p className="text-sm text-muted-foreground">
          Download a file of everything BeamX holds about you
          {email === null ? "." : ", or delete your account and all its data."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void downloadMyData()
              .then(setMessage)
              .finally(() => setBusy(false));
          }}
        >
          <DownloadIcon aria-hidden />
          {DOWNLOAD_LABEL}
        </Button>
        {email === null ? null : (
          <Button variant="outline" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon aria-hidden />
            {DELETE_LABEL}
          </Button>
        )}
      </div>
      <p role="status" className="text-sm text-muted-foreground empty:hidden">
        {message}
      </p>
      {email === null ? null : (
        <DeleteAccountDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          email={email}
        />
      )}
    </section>
  );
}
