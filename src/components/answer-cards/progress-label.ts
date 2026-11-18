import type { QuestionProgress } from "./types";

/**
 * "Marketing · Area 3 of 9 · Question 4 of 7", or "Question 4 of 7" with no area.
 * Counts start at 1 (the caller passes 1 based indexes).
 */
export function progressLabel(progress: QuestionProgress): string {
  const question = `Question ${progress.question.index} of ${progress.question.total}`;
  if (!progress.area) return question;
  const { name, index, total } = progress.area;
  return `${name} · Area ${index} of ${total} · ${question}`;
}
