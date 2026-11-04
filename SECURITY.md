# Security

## Reporting a problem

Please report vulnerabilities privately through GitHub's **Security → Report a vulnerability** on this repository, not in a public issue.

## What is protected, and how

| Threat | Protection | Tested by |
|---|---|---|
| **Settings that change prototypes** | Settings from the `options` attribute or `setOptions` are merged key by key. `__proto__`, `constructor` and `prototype` keys are skipped, so a JSON setting can't swap the prototype of the chart's settings or pollute anything else. | `test/security.test.ts` "a __proto__ key…" |
| **Hostile saved states** | `setState`, `setDrawings`, `addDrawing` and `updateDrawing` check every field: tools must be known (own keys only), points must be finite numbers, and text, widths and font sizes are bounded. At most 2,000 drawings and 500 alerts are kept, and view ranges must be finite. | "setState keeps only sound drawings…", "addDrawing and updateDrawing refuse…" |
| **HTML and CSS injection in the element** | Labels and range names are escaped. Drawing-tool names must be known tools. Swatch colours are set through the CSS object model as a background colour, so a value can't add a `url()` request or break out of the attribute. Canvas text is never HTML. | "drawing-colour swatches…", "drawing tools named after Object's own keys…" |
| **Code injection through the MCP server** | `get_snippet` pastes its inputs into JavaScript, HTML, JSX, Vue, Svelte, Angular and Razor code. So `symbol`, `timeframe` and `indicators` are limited to the characters those values need, both in the tool's schema and in the generator. Settings are printed as JSON with `<` escaped, so they can't close a `<script>`. Text inputs have length limits. | "MCP snippets" (8 hostile inputs × 7 frameworks) |
| **The demo and docs site** | A Content-Security-Policy allows scripts only from the site itself, with no inline scripts or `eval`. Connections may go only to the site and Binance's public market data. The site also sends `frame-ancestors 'none'`, `X-Frame-Options`, HSTS, `nosniff`, a referrer policy and a permissions policy. | a browser check of the home and docs pages under these headers |
| **Supply chain** | The library has no runtime dependencies. CI runs `npm audit` and pins GitHub Actions to commits. Releases use npm trusted publishing (no stored token) with provenance, a pinned npm version, and `npm ci --ignore-scripts`, so no dependency script runs in the job that can publish. | CI |

## Notes for sites using the chart

See [Troubleshooting](docs/troubleshooting.md) for the Content-Security-Policy the element needs. Inline styles must be allowed for its shadow-root `<style>`; scripts need no exceptions.
