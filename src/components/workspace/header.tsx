"use client";

import { MenuIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";
import { useWorkspace } from "./workspace-context";

/**
 * The top bar. Below `lg` it shows a menu button that opens the history drawer. The theme
 * menu (Light, Dark, System) is always here. `children` fill the space on the right.
 */
export function Header({ children }: { readonly children?: ReactNode }) {
  const workspace = useWorkspace();
  const showMenuButton = workspace !== null && !workspace.isDesktop;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2 md:px-4">
      {showMenuButton ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open chat history"
          onClick={() => workspace.setHistoryOpen(true)}
        >
          <MenuIcon aria-hidden />
        </Button>
      ) : null}
      <BrandMark variant="logo" className="max-[399px]:hidden" />
      <BrandMark variant="mark" className="min-[400px]:hidden" />
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {children}
        <ThemeToggle />
      </div>
    </header>
  );
}
