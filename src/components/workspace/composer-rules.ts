/** The pure rules behind the Composer (AC-7). */

export const DEFAULT_MAX_LENGTH = 4000;
/** The counter shows once the text passes 90% of the limit (3,600 of 4,000). */
export const counterStart = (max: number): number => Math.floor(max * 0.9);

/** Send is allowed for non empty trimmed text of at most `max` UTF-16 units. */
export const canSend = (text: string, max: number): boolean =>
  text.trim().length > 0 && text.length <= max;

export const showCounter = (text: string, max: number): boolean =>
  text.length > counterStart(max);

/** "3,712 / 4,000" */
export const counterText = (text: string, max: number): string => {
  const format = new Intl.NumberFormat("en-NG");
  return `${format.format(text.length)} / ${format.format(max)}`;
};

export type EnterKey = {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
  /** `matchMedia("(pointer: coarse)")`: a touch screen. */
  readonly coarsePointer: boolean;
};

/**
 * Enter sends only with a fine pointer (desktop), without Shift, and never while a word
 * is still being composed (predictive or other language keyboards). On touch screens
 * Enter adds a line and only the Send button sends.
 */
export const enterShouldSend = (event: EnterKey): boolean =>
  event.key === "Enter" &&
  !event.shiftKey &&
  !event.isComposing &&
  !event.coarsePointer;
