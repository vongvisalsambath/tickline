// Builds dist/tickline.js (ES module) and dist/tickline.umd.js (for a plain <script> tag), then reports gzip sizes.
import { build, context } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const common = { entryPoints: ["src/index.ts"], bundle: true, minify: true, target: ["es2020"], legalComments: "none", sourcemap: true };
const outputs = [
  { ...common, format: "esm", outfile: "dist/tickline.js" },
  { ...common, format: "iife", globalName: "Tickline", outfile: "dist/tickline.umd.js" },
];

if (process.argv.includes("--watch")) {
  for (const o of outputs) await (await context(o)).watch();
  console.log("watching src/ …");
} else {
  for (const o of outputs) await build(o);
  for (const o of outputs) {
    const buf = readFileSync(o.outfile);
    console.log(`${o.outfile}: ${(buf.length / 1024).toFixed(1)} KiB, ${(gzipSync(buf).length / 1024).toFixed(1)} KiB gzip`);
  }
}
