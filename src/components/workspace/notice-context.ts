"use client";

import { createContext, useContext } from "react";
import { paymentToast } from "@/components/credits/credit-copy";

/**
 * A short confirmation the workspace shows as a toast (spec 0009, AC-6). The Thread reads
 * `notice` and announces it through its one polite live region, so the toast itself stays
 * visual only. `show` sets it from anywhere in the shell (the header's account control).
 */
export type NoticeValue = {
  readonly notice: string | null;
  readonly show: (message: string) => void;
};

export const NoticeContext = createContext<NoticeValue>({
  notice: null,
  show: () => {},
});

export const useNotice = (): NoticeValue => useContext(NoticeContext);

const QUEUED_KEY = "beamx:notice";

/**
 * Keeps a notice for the next page in this tab, for a change that ends in a full page
 * load (deleting the account, AC-13). The chat frame takes it on mount.
 */
export const queueNotice = (message: string): void => {
  try {
    sessionStorage.setItem(QUEUED_KEY, message);
  } catch {
    // Storage off (private mode): the page still loads, just without the toast.
  }
};

/**
 * Shows the queued notice through `show` just after mount, then forgets it. Returns the
 * cleanup for `useEffect`. The notice is removed only when it is shown, so React's dev
 * double effect (mount, cleanup, mount) never loses it.
 */
export const showQueuedNotice = (
  show: (message: string) => void,
): (() => void) => {
  let message: string | null = null;
  try {
    message = sessionStorage.getItem(QUEUED_KEY);
  } catch {
    // Storage off: nothing was queued.
  }
  if (message === null) return () => {};
  const queued = message;
  const timer = setTimeout(() => {
    try {
      sessionStorage.removeItem(QUEUED_KEY);
    } catch {
      // Storage off: nothing to remove.
    }
    show(queued);
  }, 0);
  return () => clearTimeout(timer);
};

const PAYMENT_NOTICES = [
  "succeeded",
  "pending",
  "failed",
  "not_found",
] as const;

/**
 * The toast after Paystack sends the client back to the chat (spec 0004, AC-8): reads
 * the `payment` query value the callback added, removes it from the address bar (so a
 * reload does not show it again), and shows its message just after mount. Returns the
 * cleanup for `useEffect`.
 */
export const showPaymentNotice = (
  show: (message: string) => void,
): (() => void) => {
  const value = new URL(window.location.href).searchParams.get("payment");
  if (value === null) return () => {};
  const notice = PAYMENT_NOTICES.find((n) => n === value);
  // Removed only when the timer fires, so React's dev double effect never loses it.
  const timer = setTimeout(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("payment");
    window.history.replaceState(window.history.state, "", url.toString());
    const message = notice === undefined ? null : paymentToast(notice);
    if (message !== null) show(message);
  }, 0);
  return () => clearTimeout(timer);
};
