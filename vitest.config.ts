import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only the canonical suite under tests/. Excludes node_modules, the build
    // output, and stale agent worktrees under .claude/ that would otherwise be
    // scanned and run as duplicate (and stale) copies of the tests.
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "build/**", ".claude/**"],
    setupFiles: ["tests/setup.ts"],
  },
});
