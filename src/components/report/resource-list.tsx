import { ExternalLinkIcon } from "lucide-react";
import { externalLinkProps, safeHttpsUrl } from "./safe-link";

type Resource = {
  readonly title: string;
  readonly description: string;
  readonly url: string | null;
};

/**
 * Suggested resources. A title is a link only when its URL is `https:` (the safe link
 * rule); otherwise it shows as plain text, so a bad link never reaches the page.
 */
export function ResourceList({
  items,
  label,
}: {
  readonly items: readonly Resource[];
  readonly label: string;
}) {
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {items.map((item, index) => {
        const href = safeHttpsUrl(item.url);
        return (
          <li
            key={`${index}-${item.title}`}
            className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 text-card-foreground"
          >
            {href === null ? (
              <p className="font-medium wrap-anywhere">{item.title}</p>
            ) : (
              <a
                href={href}
                {...externalLinkProps}
                className="inline-flex items-center gap-1.5 self-start font-medium wrap-anywhere text-primary underline underline-offset-4"
              >
                {item.title}
                <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
            <p className="text-sm wrap-anywhere text-muted-foreground">
              {item.description}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
