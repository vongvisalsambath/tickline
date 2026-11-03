// Copies the built library into the site (site/lib), so the site can be served as plain static files.
import { cpSync, mkdirSync } from "node:fs";
mkdirSync("site/lib", { recursive: true });
for (const f of ["tickline.js", "tickline.js.map"]) cpSync(`dist/${f}`, `site/lib/${f}`);
console.log("site/lib updated");
