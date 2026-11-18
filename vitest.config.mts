import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts", "node_modules/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          setupFiles: ["dotenv/config"],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
