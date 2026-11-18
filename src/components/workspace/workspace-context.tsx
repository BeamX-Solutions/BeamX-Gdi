"use client";

import { createContext, useContext, type RefObject } from "react";

export type WorkspaceContextValue = {
  readonly isDesktop: boolean;
  readonly railCollapsed: boolean;
  readonly toggleRail: () => void;
  readonly historyOpen: boolean;
  readonly setHistoryOpen: (open: boolean) => void;
  /** Opens the full screen report sheet (phones). */
  readonly openReport: () => void;
  /** The "View report" card the sheet returns focus to on close. */
  readonly reportCardRef: RefObject<HTMLButtonElement | null>;
};

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null,
);

/** Null outside a `WorkspaceShell`, so shared parts still render on their own. */
export function useWorkspace(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}
