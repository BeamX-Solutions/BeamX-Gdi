import { Shimmer } from "@/components/ai-elements/shimmer";

type StatusLineProps = {
  /** Plain text status, like "Scoring your answers…". Null hides the line. */
  readonly text: string | null;
};

/**
 * The "assistant is working" line. It is not a live region itself: the Thread owns the
 * one polite live region and announces each new text there (AC-6).
 */
export function StatusLine({ text }: StatusLineProps) {
  if (text === null) return null;
  return (
    <p
      className="min-w-0 px-1 text-base wrap-anywhere"
      data-testid="status-line"
    >
      <Shimmer>{text}</Shimmer>
    </p>
  );
}
