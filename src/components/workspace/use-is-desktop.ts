"use client";

import { useSyncExternalStore } from "react";

/** Subscribe to a media query. The server and the first client render see `false`. */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True from 1024px (the `lg` breakpoint). False on the server, so the phone layout renders first. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}

/** True from 1280px, where the history rail can stay open next to a report panel. */
export function useIsWide(): boolean {
  return useMediaQuery("(min-width: 1280px)");
}
