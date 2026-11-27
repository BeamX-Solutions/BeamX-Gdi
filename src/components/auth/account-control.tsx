"use client";

import { useRouter } from "next/navigation";
import { useContext, useState } from "react";
import {
  BriefcaseBusinessIcon,
  LogOutIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
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
import { DELETE_LABEL } from "./auth-copy";
import { AuthDialog } from "./auth-dialog";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { useAuthOpen, type AuthOpenState } from "./auth-open-context";

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
  // The chat frame's shared state, so prompts in the thread open this same dialog
  // (AC-1); local state where no frame provides it.
  const shared = useAuthOpen();
  const [local, setLocal] = useState<AuthOpenState>({
    open: false,
    screen: "sign-up",
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { open, screen } = shared ?? local;
  const setOpen =
    shared?.setOpen ??
    ((next: boolean) => setLocal((s) => ({ ...s, open: next })));
  const openFromHeader = () =>
    shared
      ? shared.openAuth("sign-up")
      : setLocal({ open: true, screen: "sign-up" });

  if (session.isPending) return null;
  const user = session.data?.user;

  if (user === undefined || user.isAnonymous === true)
    return (
      <>
        <Button variant="outline" onClick={openFromHeader}>
          Sign in
        </Button>
        <AuthDialog
          // A new screen asked for starts the dialog fresh on it.
          key={screen}
          initialStep={screen}
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
    <>
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
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <BriefcaseBusinessIcon aria-hidden />
              Business profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOutIcon aria-hidden />
            Sign out
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            <Trash2Icon aria-hidden />
            {DELETE_LABEL}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteAccountDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        email={user.email}
      />
    </>
  );
}
