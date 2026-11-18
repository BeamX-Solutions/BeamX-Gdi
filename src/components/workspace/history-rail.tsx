"use client";

import { PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { useWorkspace } from "./workspace-context";

export type HistoryItem = {
  readonly id: string;
  readonly title: string;
  readonly href: string;
};

/**
 * Chat history. 16rem open, 3.5rem collapsed on desktop; always open inside the phone drawer.
 * Placeholder list until feature #14 fills it.
 */
export function HistoryRail({
  items,
}: {
  readonly items: readonly HistoryItem[];
}) {
  const workspace = useWorkspace();
  const collapsed =
    workspace !== null && workspace.isDesktop && workspace.railCollapsed;

  return (
    <aside
      aria-label="Chat history"
      className={cn(
        "flex h-full shrink-0 flex-col gap-2 border-r bg-background p-2",
        collapsed ? "w-14 items-center" : "w-full lg:w-64",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2",
          collapsed ? "flex-col" : "justify-between",
        )}
      >
        {collapsed ? (
          <BrandMark variant="mark" />
        ) : (
          <span className="px-2 text-sm font-medium">History</span>
        )}
        {workspace !== null && workspace.isDesktop ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "Expand history" : "Collapse history"}
            aria-expanded={!collapsed}
            onClick={workspace.toggleRail}
          >
            {collapsed ? (
              <PanelLeftOpenIcon aria-hidden />
            ) : (
              <PanelLeftCloseIcon aria-hidden />
            )}
          </Button>
        ) : null}
      </div>
      <Button
        variant="outline"
        size={collapsed ? "icon" : "default"}
        className={collapsed ? undefined : "justify-start"}
        aria-label="New chat"
        asChild
      >
        <Link href="/design/shell">
          <PlusIcon aria-hidden />
          {collapsed ? null : "New chat"}
        </Link>
      </Button>
      {collapsed ? null : (
        <nav
          aria-label="Recent chats"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {items.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              Your chats will show here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex min-h-11 items-center rounded-md px-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="min-w-0 truncate">{item.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>
      )}
    </aside>
  );
}
