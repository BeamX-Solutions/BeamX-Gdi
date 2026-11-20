import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  // Spec 0005, AC-14: a tool folder imports only the contract, the kit, zod and Result.
  // Never the assistant, the DB, routes, UI, or another tool folder.
  {
    files: ["src/tools/**/*.ts"],
    ignores: ["src/tools/registry.ts", "src/tools/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/(?!lib/result$|tools/_contract$|tools/_kit/)",
              message:
                "Tool code may import only @/lib/result, tools/_contract and tools/_kit (spec 0005).",
            },
            {
              regex: "^\\.\\./(?!_contract$|_kit/)",
              message:
                "A tool folder never imports another tool folder; use tools/_contract or tools/_kit (spec 0005).",
            },
            {
              regex: "^(?!zod$|@/|\\.)",
              message: "Tool code may import no package but zod (spec 0005).",
            },
          ],
        },
      ],
    },
  },
  // Keep last: turns off rules that fight Prettier formatting.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/**",
    "docs/**",
  ]),
]);

export default eslintConfig;
