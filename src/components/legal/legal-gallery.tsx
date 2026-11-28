"use client";

import { DataControls } from "@/components/profile/data-controls";
import { PolicyNotice } from "./policy-notice";
import { TermsUpdateCard } from "./terms-update-card";

/** The privacy and data parts on fixture props, for `/design` (spec 0017). */
export function LegalGallery() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">Policy small print</h3>
        <PolicyNotice lead="By chatting you agree to" />
        <PolicyNotice lead="By creating an account you agree to" />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">Updated terms card</h3>
        <TermsUpdateCard onAccept={async () => ({ ok: true, value: null })} />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">Your data (account)</h3>
        <DataControls email="ada@example.com" />
      </div>
    </div>
  );
}
