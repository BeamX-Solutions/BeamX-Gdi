import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { sessionUser } from "@/auth/session";
import { billingConfig } from "@/billing/config";
import { ProfileList } from "@/components/profile/profile-list";
import { profileRows } from "@/components/profile/profile-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/workspace/header";
import * as profile from "@/db/queries/profile";
import { getTool } from "@/tools/registry";
import { removeFactAction, updateFactAction } from "./actions";

export const metadata: Metadata = {
  title: "Business profile · BeamX Workspace",
};

/**
 * The business profile page (spec 0012, AC-8): what BeamX remembers about the client's
 * business, where each fact came from, with edit and remove. The frame is static; the
 * facts stream in behind Suspense. Guests see a sign in note (their facts are still
 * kept and carried over when they sign up).
 */
export default function ProfilePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center px-2 text-sm font-medium underline-offset-4 hover:underline"
        >
          Back to chat
        </Link>
      </Header>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Business profile</h1>
          <p className="text-sm text-muted-foreground">
            What BeamX tools remember about your business, so you are not asked
            twice. Changes here apply to your next tool run.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
          <ProfileContent />
        </Suspense>
      </main>
    </div>
  );
}

const toolName = (toolId: string): string | null => {
  const found = getTool(toolId);
  return found.ok ? found.value.name : null;
};

async function ProfileContent() {
  await connection();
  const user = await sessionUser(await headers());
  if (user === null || user.isAnonymous)
    return (
      <section className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground md:p-5">
        <p className="font-semibold">Sign in to see your business profile</p>
        <p className="text-sm text-muted-foreground">
          Open the chat and sign in to your account. What you tell BeamX tools
          as a guest is kept and moves to your account when you sign up.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Go to the chat
        </Link>
      </section>
    );
  const facts = await profile.get(user.id);
  return (
    <ProfileList
      rows={profileRows(facts, toolName, billingConfig.chat.dayTimeZone)}
      onSave={updateFactAction}
      onRemove={removeFactAction}
    />
  );
}
