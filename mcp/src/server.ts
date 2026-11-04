// Tickline MCP server: helps AI coding assistants add and configure Tickline charts.
// Runs over stdio:  npx -y tickline-mcp
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  DATA_SOURCES, DOCS, SNIPPET_PATTERNS, FRAMEWORKS, GROUPS, SECTIONS, VERSION, getSection, indicators, listOptions, searchDocs, snippet, validateOptions,
} from "./knowledge";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "tickline", title: "Tickline", version: VERSION },
    {
      instructions:
        "Tickline is a live trading chart for websites: one <trade-chart> element (or the Chart class) with candles, indicators, " +
        "drawing tools, alerts, image export and full screen. Use these tools to answer questions about it and to write integration code: " +
        "search_docs or get_doc for how things work, list_options for every setting and its default, validate_options before " +
        "suggesting a settings object, list_indicators for indicator ids and parameters, and get_snippet for working code per framework.",
    },
  );

  server.registerTool("search_docs", {
    title: "Search the Tickline docs",
    description: "Finds the README and configuration-guide sections that match a question, e.g. \"full screen\", \"translate labels\", \"load older candles\".",
    inputSchema: { query: z.string().max(500).describe("Words to look for"), limit: z.number().int().min(1).max(10).optional().describe("Most sections to return (default 4)") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query, limit }) => {
    const hits = searchDocs(query, limit ?? 4);
    if (!hits.length) return text(`Nothing matched "${query}". Sections: ${SECTIONS.map((s) => s.id).join(", ")}`);
    return text(hits.map((s) => `<!-- ${s.id} -->\n${s.text}`).join("\n\n---\n\n"));
  });

  server.registerTool("get_doc", {
    title: "Read a docs section",
    description: "Returns one section of the Tickline docs by id or title (e.g. \"configuration/livePosition\", \"Events\"). Without a section, lists them all.",
    inputSchema: { section: z.string().max(200).optional().describe("Section id or title") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ section }) => {
    if (!section) return text(SECTIONS.map((s) => `${s.id}  (${s.title})`).join("\n"));
    const s = getSection(section);
    return s ? text(s.text) : text(`No section "${section}". Sections:\n${SECTIONS.map((x) => x.id).join("\n")}`);
  });

  server.registerTool("list_options", {
    title: "List chart settings",
    description: "Every setting in a group with its default and what it does. Groups: " + GROUPS.join(", ") + ". Without a group, lists all of them.",
    inputSchema: { group: z.enum(GROUPS).optional().describe("Settings group") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ group }) => json(listOptions(group)));

  server.registerTool("validate_options", {
    title: "Check a settings object",
    description: "Checks settings for chart.setOptions() or the options attribute: unknown names, wrong types, invalid values, and values the chart will clamp.",
    inputSchema: { options: z.record(z.string(), z.unknown()).describe("The settings object, e.g. { \"grid\": { \"vertical\": false } }") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ options }) => {
    const r = validateOptions(options);
    return json({ valid: r.valid, problems: r.problems, warnings: r.warnings });
  });

  server.registerTool("list_indicators", {
    title: "List indicators",
    description: "Built-in indicators with their ids, parameters, defaults and the form used in the indicators attribute (e.g. rsi:14).",
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => json(indicators()));

  server.registerTool("get_snippet", {
    title: "Integration code",
    description: "Working code that adds a live Tickline chart to an app: loads history, streams prices, and loads older candles on scroll.",
    inputSchema: {
      framework: z.enum(FRAMEWORKS).describe("Where the chart goes"),
      symbol: z.string().regex(SNIPPET_PATTERNS.symbol).optional().describe("Market name, e.g. BTC/USDT (default): letters, digits, spaces and . _ : / -"),
      timeframe: z.string().regex(SNIPPET_PATTERNS.timeframe).optional().describe("Candle size: 1m (default), 5m, 1h, 1d …"),
      type: z.enum(["candles", "hollow", "bars", "heikin-ashi", "line", "area"]).optional(),
      indicators: z.string().regex(SNIPPET_PATTERNS.indicators).optional().describe("e.g. \"sma:20, rsi:14, volume\""),
      theme: z.enum(["dark", "light"]).optional(),
      height: z.number().int().min(80).max(4000).optional().describe("Height in px (default 480)"),
      options: z.record(z.string(), z.unknown()).optional().describe("Settings to pass to setOptions"),
      dataSource: z.enum(DATA_SOURCES).optional().describe("your-api (default: placeholders for your endpoints) or binance-demo (free public crypto data)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (input) => {
    if (input.options) {
      const r = validateOptions(input.options);
      if (!r.valid) return { ...json({ error: "The options aren't valid.", problems: r.problems }), isError: true };
    }
    let out: ReturnType<typeof snippet>;
    try { out = snippet(input); } catch (e) { return { ...text((e as Error).message), isError: true }; }
    return text([...out.files.map((f) => `// ${f.name}\n${f.code}`), out.notes.map((n) => `Note: ${n}`).join("\n")].join("\n\n"));
  });

  server.registerResource("readme", "tickline://docs/readme", {
    title: "Tickline README", description: "Install, usage, reference", mimeType: "text/markdown",
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: DOCS.readme }] }));

  server.registerResource("configuration", "tickline://docs/configuration", {
    title: "Tickline configuration guide", description: "Every setting, its default, attributes and recipes", mimeType: "text/markdown",
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: DOCS.configuration }] }));

  server.registerPrompt("add_chart", {
    title: "Add a Tickline chart",
    description: "Steps for adding a live trading chart to this project",
    argsSchema: { framework: z.string().optional().describe("react, vue, angular, svelte, blazor or html") },
  }, ({ framework }) => ({
    messages: [{
      role: "user" as const,
      content: {
        type: "text" as const,
        text: `Add a live Tickline trading chart to this project${framework ? ` (${framework})` : ""}. ` +
          "Look at how the project fetches data, then use get_snippet for the framework, adapt the data loading to the project's API, " +
          "check any settings with validate_options, and install it with `npm i tickline`.",
      },
    }],
  }));

  return server;
}

export async function main(): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}
