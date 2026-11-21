/** Small pieces of chat wording (spec 0007, "Part renderers"). Pure. */

/** The bubble for a prefill response: what was kept, and which answer is changing. */
export const prefillResponseText = (
  accepted: number,
  editPrompt: string | null,
): string => {
  const kept =
    accepted === 0
      ? null
      : `Use ${accepted === 1 ? "this answer" : `these ${accepted} answers`}`;
  const change = editPrompt === null ? null : `change "${editPrompt}"`;
  if (kept && change) return `${kept}, and ${change}`;
  if (kept) return kept;
  return change ? change.charAt(0).toUpperCase() + change.slice(1) : "Got it";
};

/** "Stellar report". */
export const reportTitle = (toolName: string): string => `${toolName} report`;
