/**
 * Server only. The PDF's font and logo (spec 0015, AC-4): Montserrat from the TTF files
 * beside this module, and the BeamX logo embedded as a data URI so it renders the same
 * everywhere. `next.config.ts` traces both into the PDF and email routes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { registerFonts } from "./luna/fonts";

let ready: { readonly logo: string } | null = null;

/** Registers the fonts once and returns the logo; safe to call on every render. */
export const pdfAssets = (): { readonly logo: string } => {
  if (ready) return ready;
  const root = process.cwd();
  registerFonts(path.join(root, "src", "pdf", "fonts"));
  const logo = readFileSync(path.join(root, "public", "brand", "logo.png"));
  ready = { logo: `data:image/png;base64,${logo.toString("base64")}` };
  return ready;
};
