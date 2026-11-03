# tickline-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for [Tickline](https://tickline-chart.vercel.app), the live trading chart for websites.

Add it to your AI assistant and ask things like *"add a live BTC chart to the dashboard page"*, *"keep the live price in the middle of the chart"* or *"translate the chart into German"*. The assistant can then read Tickline's docs, look up any setting and its default, check a settings object before using it, and write working integration code for your framework.

It runs on your computer (Node.js 20 or later), needs no API key, and doesn't send anything anywhere: the docs are inside the package.

## Set up

**Claude Code**

```sh
claude mcp add tickline -- npx -y tickline-mcp
```

**Claude Desktop**: Settings → Developer → Edit Config, then add to `claude_desktop_config.json` and restart:

```json
{
  "mcpServers": {
    "tickline": { "command": "npx", "args": ["-y", "tickline-mcp"] }
  }
}
```

**Cursor**: add to `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` for every project):

```json
{
  "mcpServers": {
    "tickline": { "command": "npx", "args": ["-y", "tickline-mcp"] }
  }
}
```

**VS Code** (GitHub Copilot agent mode): add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "tickline": { "type": "stdio", "command": "npx", "args": ["-y", "tickline-mcp"] }
  }
}
```

Any other MCP client: run `npx -y tickline-mcp` as a stdio server.

## Tools

| Tool | What it does |
|---|---|
| `search_docs` | Finds the docs sections that match a question, e.g. "full screen" or "load older candles" |
| `get_doc` | Reads one docs section; without a name, lists them |
| `list_options` | Every setting in a group (`layout`, `crosshair`, `livePosition` …) with its default and what it does |
| `validate_options` | Checks a settings object: unknown names, wrong types, invalid values, and values the chart will clamp |
| `list_indicators` | Indicator ids, parameters and defaults, and how to write them in the `indicators` attribute |
| `get_snippet` | Working code for HTML, plain JavaScript, React, Vue, Angular, Svelte or Blazor: loads history, streams live prices and loads older candles as the user scrolls. Uses placeholders for your API, or Binance's free public data for a quick demo |

It also offers the README and the configuration guide as resources (`tickline://docs/readme`, `tickline://docs/configuration`), and an `add_chart` prompt.

## Try it without an assistant

```sh
npx @modelcontextprotocol/inspector npx -y tickline-mcp
```

opens the MCP Inspector in your browser, where you can call each tool.

## Licence

MIT © Vong Visalsambath
