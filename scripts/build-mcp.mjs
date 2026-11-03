// Builds the MCP server into one file with no runtime dependencies: mcp/dist/tickline-mcp.js
import { build } from "esbuild";
import { readFileSync, statSync } from "node:fs";

import { fileURLToPath } from "node:url";

// paths from the repository root, so this works from the root or from mcp/ (npm publish runs it there)
const root = (p) => fileURLToPath(new URL("../" + p, import.meta.url));
const { version } = JSON.parse(readFileSync(root("package.json"), "utf8"));
const out = root("mcp/dist/tickline-mcp.js");

await build({
  entryPoints: [root("mcp/src/cli.ts")],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: true,
  legalComments: "linked",
  loader: { ".md": "text" },
  define: { __TICKLINE_VERSION__: JSON.stringify(version) },
  // some bundled packages are CommonJS and call require()
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __tlRequire } from "node:module"; const require = __tlRequire(import.meta.url);' },
});
console.log(`mcp/dist/tickline-mcp.js: ${(statSync(out).size / 1024).toFixed(1)} KiB (tickline ${version})`);
