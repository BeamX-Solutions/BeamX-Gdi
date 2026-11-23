"use client";

import { createContext, useContext } from "react";

/**
 * Whether the auth dialog is open, and on which screen (spec 0009, AC-1). The chat frame
 * holds it, so the header's Sign in button and the prompts in the thread (the save card,
 * the guest limit notices, the short balance card) all open the one dialog the header's
 * account control renders.
 */
export type AuthScreen = "sign-up" | "sign-in";

export type AuthOpenState = {
  readonly open: boolean;
  readonly screen: AuthScreen;
};

export type AuthOpenValue = AuthOpenState & {
  readonly openAuth: (screen: AuthScreen) => void;
  readonly setOpen: (open: boolean) => void;
};

export const AuthOpenContext = createContext<AuthOpenValue | null>(null);

/** Null outside a chat frame (the `/design` showcase): prompts then render no button. */
export const useAuthOpen = (): AuthOpenValue | null =>
  useContext(AuthOpenContext);
