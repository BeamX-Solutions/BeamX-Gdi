"use client";

import { createContext, useContext } from "react";

/**
 * A short confirmation the workspace is showing as a toast (spec 0009, AC-6), or null.
 * The Thread reads it and announces it through its one polite live region, so the toast
 * itself stays visual only.
 */
export const NoticeContext = createContext<string | null>(null);

export const useNotice = (): string | null => useContext(NoticeContext);
