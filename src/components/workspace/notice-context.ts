"use client";

import { createContext, useContext } from "react";

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
