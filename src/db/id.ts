import { v7 } from "uuid";

/** UUID v7 (time ordered). The one id helper for every app table and the AI SDK `generateId`. */
export const newId = (): string => v7();
