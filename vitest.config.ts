import { defineConfig } from "vitest/config";

// Markdown is bundled as text into the MCP server; tests read it the same way.
export default defineConfig({
  plugins: [{
    name: "markdown-as-text",
    transform(code, id) {
      if (id.endsWith(".md")) return { code: `export default ${JSON.stringify(code)};`, map: null };
    },
  }],
});
