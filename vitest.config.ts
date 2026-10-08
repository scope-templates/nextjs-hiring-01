import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"], env: { HIRING_DB: ":memory:" } },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
