import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Every CSS variable named in backticks, like `--primary`. */
const tokensIn = (text: string): readonly string[] => [
  ...new Set(
    [...text.matchAll(/`(--[a-z][a-z0-9-]*)`/g)].map((match) => match[1] ?? ""),
  ),
];

/** Every CSS variable defined in globals.css, like `--primary:`. */
const definedIn = (css: string): ReadonlySet<string> =>
  new Set([...css.matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)].map((m) => m[1] ?? ""));

describe("DESIGN.md and globals.css agree (AC-1)", () => {
  const named = tokensIn(read("DESIGN.md"));
  const defined = definedIn(read("src/app/globals.css"));

  it("names at least the core tokens", () => {
    expect(named).toEqual(
      expect.arrayContaining([
        "--background",
        "--primary",
        "--verdict-good",
        "--verdict-risk-strong",
      ]),
    );
  });

  it("defines every token DESIGN.md names", () => {
    const missing = named.filter((token) => !defined.has(token));
    expect(missing).toEqual([]);
  });

  it("defines each color token in both themes", () => {
    const css = read("src/app/globals.css");
    const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
    const darkBlock = css.slice(css.indexOf(".dark {"));
    const colorTokens = named.filter(
      (token) =>
        token !== "--font-sans" &&
        token !== "--font-mono" &&
        token !== "--radius",
    );
    for (const token of colorTokens) {
      expect(rootBlock, `${token} in :root`).toContain(`${token}:`);
      expect(darkBlock, `${token} in .dark`).toContain(`${token}:`);
    }
  });
});
