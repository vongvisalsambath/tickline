# AI assistants

Two things help AI coding assistants work with Tickline: an **MCP server** that gives them the docs and tools, and a **skill** that teaches Claude how to add and configure charts well. The Claude Code plugin installs both together.

## Claude Code: the plugin (skill + MCP server)

In a Claude Code session (version 2.1.275 or later):

```
/plugin install tickline --marketplace vongvisalsambath/tickline
```

Or from your shell, in two steps (any version with plugins):

```sh
claude plugin marketplace add vongvisalsambath/tickline
claude plugin install tickline@tickline
```

Then ask in plain words: *"add a live BTC chart to the dashboard page"*, *"keep the live price in the middle of the chart"*, *"translate the chart into German"*. Claude uses the skill on its own when a task involves Tickline; you can also run it directly as `/tickline:chart`.

The MCP server in the plugin starts with `npx -y tickline-mcp`, so it needs Node.js 20 or later.

## Other assistants: the MCP server

`tickline-mcp` works with any app that supports the Model Context Protocol: Claude Desktop, Cursor, VS Code, Windsurf and others. Setup for each is in [mcp/README.md](https://github.com/vongvisalsambath/tickline/tree/main/mcp#set-up). In Claude Code without the plugin:

```sh
claude mcp add tickline -- npx -y tickline-mcp
```

Its tools:

| Tool | |
|---|---|
| `search_docs`, `get_doc` | Find and read sections of these docs |
| `list_options` | Every setting in a group, with its default and description |
| `validate_options` | Check a settings object before using it |
| `list_indicators` | Indicator ids, parameters and defaults |
| `get_snippet` | Working code for HTML, JavaScript, React, Vue, Angular, Svelte or Blazor |

The server runs on your computer, needs no account or key, and makes no network requests: the docs are inside it.

## The skill on its own

The skill is a folder with a `SKILL.md` file: [`plugins/tickline/skills/chart`](https://github.com/vongvisalsambath/tickline/tree/main/plugins/tickline/skills/chart). To use it without the plugin, copy that folder to `~/.claude/skills/tickline-chart/` (for all your projects) or `.claude/skills/tickline-chart/` in a project.
