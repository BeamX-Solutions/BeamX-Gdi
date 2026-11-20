/**
 * The safe link rule for report blocks (spec 0005, security model): a link from AI
 * output is shown only when it parses as an `https:` URL. Anything else (plain http,
 * `javascript:`, a relative path, junk) is dropped and the item shows as text.
 */
export const safeHttpsUrl = (url: string | null): string | null => {
  if (url === null) return null;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
};

/** Attributes every external report link carries. */
export const externalLinkProps = {
  target: "_blank",
  rel: "noopener noreferrer nofollow",
} as const;
