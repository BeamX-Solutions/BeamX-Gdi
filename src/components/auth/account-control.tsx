"use client";

import { useRouter } from "next/navigation";
import { useContext, useState } from "react";
import { LogOutIcon, UserRoundIcon } from "lucide-react";
import { authClient } from "@/auth/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LiveCreditSummary } from "@/components/credits/credit-chip";
import { useNotice } from "@/components/workspace/notice-context";
import { AuthDialog } from "./auth-dialog";

/**
 * The header's account control (spec 0009, AC-1, AC-12): a Sign in button for guests (and
 * before the first send), an account menu with the first name, email and Sign out once
 * signed in. Nothing while the session loads, so the header never flickers.
 */
export function AccountControl({
  availableCredits,
}: {
  /**
   * The credits the header's server read found (`credits.getSummary`), 0 with no
   * account. A guest with any sees the forfeit note on sign in (AC-7).
   */
  readonly availableCredits: number;
}) {
  const session = authClient.useSession();
  const router = useRouter();
  const { show } = useNotice();
  const live = useContext(LiveCreditSummary);
  const [open, setOpen] = useState(false);

  if (session.isPending) return null;
  const user = session.data?.user;

  if (user === undefined || user.isAnonymous === true)
    return (
      <>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Sign in
        </Button>
        <AuthDialog
          open={open}
          onOpenChange={setOpen}
          guestHasCredits={(live?.available ?? availableCredits) > 0}
          onSignedIn={(message) => {
            show(message);
            // The header chip and the chat page read the session on the server.
            router.refresh();
          }}
        />
      </>
    );

  const signOut = async () => {
    await authClient.signOut();
    // A full page load to `/`, not a router push: the router's client cache could still
    // hold this account's pages, and nothing of the account may stay on screen (AC-12).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          <UserRoundIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-sm font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOutIcon aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
