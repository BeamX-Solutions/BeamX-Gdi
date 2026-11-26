/**
 * Where a prefill item came from, shown per item only when one card mixes sources
 * (spec 0012, AC-7). A card from one source says it once, in its title. Pure.
 */
type Source = "client" | "chat" | "profile" | "file";

const LABELS: Readonly<Record<Source, string>> = {
  profile: "From your profile",
  chat: "From our chat",
  client: "From your last run",
  file: "From your file",
};

/** One label per item (by index) when sources differ, else null for every item. */
export const prefillOrigins = (
  items: readonly { readonly source?: Source }[],
): readonly (string | null)[] => {
  const sources = new Set(items.map((i) => i.source ?? "chat"));
  return items.map((i) =>
    sources.size > 1 ? LABELS[i.source ?? "chat"] : null,
  );
};
