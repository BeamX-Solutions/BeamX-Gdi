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
  /** "Beacon report", when the chat has a ready report (feature #14). */
  readonly reports?: string | null;
};

/**
 * Chat history (feature #14): the client's chats, newest first, each with its reports,
 * the open chat marked. 16rem open, 3.5rem collapsed on desktop; always open inside the
 * phone drawer.
 */
export function HistoryRail({
  items,
  newChatHref = "/",
  activeId,
  onMore,
}: {
  readonly items: readonly HistoryItem[];
  /** Where "New chat" goes: the empty chat, or the shell demo on `/design`. */
  readonly newChatHref?: string;
  /** The open chat, marked as the current page. */
  readonly activeId?: string;
  /** Loads the next page; absent when there is none. */
  readonly onMore?: () => void;
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
        <Link href={newChatHref}>
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
                    aria-current={item.id === activeId ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 flex-col justify-center rounded-md px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground",
                      item.id === activeId &&
                        "bg-accent text-accent-foreground",
                    )}
                  >
                    <span className="min-w-0 truncate">{item.title}</span>
                    {item.reports ? (
                      <span className="min-w-0 truncate text-xs text-muted-foreground">
                        {item.reports}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {onMore ? (
            <Button
              variant="ghost"
              className="mt-1 w-full justify-start"
              onClick={onMore}
            >
              Show more
            </Button>
          ) : null}
        </nav>
      )}
    </aside>
  );
}
