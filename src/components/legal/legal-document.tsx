import Link from "next/link";
import type { LegalDocument } from "@/legal/content";
import { formatDay } from "@/components/credits/credit-copy";
import { Header } from "@/components/workspace/header";

/**
 * A policy page (spec 0017, AC-1): the typed content from `src/legal/`, with its "Last
 * updated" date and version, in the workspace's look. Static: it reads no session, so it
 * prerenders.
 */
export function LegalDocumentView({
  document,
  other,
}: {
  readonly document: LegalDocument;
  /** The other policy, linked at the end. */
  readonly other: { readonly href: string; readonly label: string };
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center px-2 text-sm font-medium underline-offset-4 hover:underline"
        >
          Back to chat
        </Link>
      </Header>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6 md:py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{document.title}</h1>
          <p className="text-sm text-muted-foreground">
            Last updated {formatDay(document.updated)} · Version{" "}
            {document.version}
          </p>
          <p>{document.intro}</p>
        </div>
        {document.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            {section.blocks.map((block, i) =>
              block.kind === "p" ? (
                <p key={i}>{block.text}</p>
              ) : (
                <ul key={i} className="flex list-disc flex-col gap-2 pl-5">
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ),
            )}
          </section>
        ))}
        <p className="border-t pt-6 text-sm text-muted-foreground">
          See also our{" "}
          <Link
            href={other.href}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {other.label}
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
