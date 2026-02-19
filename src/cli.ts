#!/usr/bin/env node

import { Command } from "commander";
import { CdpToolSource } from "@tech-sumit/webmcp-cdp";
import { ToolRegistry } from "./tool-registry.js";
import { ExtensionToolSource } from "./sources/extension.js";
import { PlaywrightBrowserSource } from "./sources/browser.js";
import { createHttpServer } from "./http.js";
import { runStdio } from "./stdio.js";
import { configureMcpClient } from "./config.js";

/**
 * Redirect all console output to stderr.
 * Required in stdio mode because stdout is the MCP protocol channel.
 */
function redirectConsoleToStderr(): void {
  const stderrWrite = (...args: unknown[]) =>
    process.stderr.write(args.map(String).join(" ") + "\n");
  console.log = stderrWrite;
  console.info = stderrWrite;
  console.warn = stderrWrite;
  console.error = stderrWrite;
}

/**
 * Shared setup: create registry and connect browser/extension sources.
 */
async function setupRegistry(opts: {
  browserTools: boolean;
  launch?: boolean;
  channel?: string;
  headless?: boolean;
  url?: string;
  cdpHost: string;
  cdpPort: number;
  extension?: boolean;
  wsPort?: number;
}): Promise<ToolRegistry> {
  const registry = new ToolRegistry();

  if (opts.browserTools !== false) {
    const browserSource = new PlaywrightBrowserSource();
    registry.addTools(browserSource, browserSource.listTools());

    if (opts.launch) {
      try {
        await browserSource.connect({
          launch: true,
          channel: opts.channel,
          headless: opts.headless,
          url: opts.url,
        });
        console.log(
          `[MCP-WebMCP] Browser launched (${opts.channel ?? "chrome-beta"}): ${browserSource.listTools().length} tools available`,
        );
      } catch (err) {
        console.warn(
          `[MCP-WebMCP] Browser launch failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    } else {
      console.log(
        `[MCP-WebMCP] ${browserSource.listTools().length} browser tools registered. Use browser_launch tool to start a browser.`,
      );
    }
  }

  if (opts.extension) {
    const extSource = new ExtensionToolSource();
    await extSource.connect({ wsPort: opts.wsPort ?? 8765 });
    extSource.onToolsChanged((tools) => registry.addTools(extSource, tools));
    console.log(
      `[MCP-WebMCP] Extension WebSocket bridge listening on ws://localhost:${opts.wsPort ?? 8765}`,
    );
  }

  return registry;
}

const program = new Command()
  .name("mcp-webmcp")
  .description("Bridge browser WebMCP tools to MCP clients")
  .version("0.1.0");

// ── Default command: stdio mode (for mcp.json / npx usage) ──────────────────
program
  .option("--launch", "Launch a new browser instead of connecting via CDP")
  .option(
    "--channel <channel>",
    "Browser channel for --launch (chrome, chrome-beta, chrome-canary, msedge)",
    "chrome-beta",
  )
  .option("--headless", "Launch browser in headless mode (with --launch)")
  .option("--url <url>", "Initial URL to open in launched browser")
  .option("--cdp-host <host>", "CDP host (when not using --launch)", "localhost")
  .option("--cdp-port <port>", "CDP port (when not using --launch)", "9222")
  .option("--extension", "Enable extension WebSocket bridge")
  .option("--ws-port <port>", "Extension WebSocket port", "8765")
  .option(
    "--no-browser-tools",
    "Disable Playwright browser automation tools",
  )
  .action(async (opts) => {
    // In stdio mode, stdout is reserved for MCP protocol — redirect logs to stderr
    redirectConsoleToStderr();

    const registry = await setupRegistry({
      launch: opts.launch,
      channel: opts.channel as string,
      headless: opts.headless,
      url: opts.url as string | undefined,
      cdpHost: opts.cdpHost as string,
      cdpPort: parseInt(opts.cdpPort as string, 10),
      browserTools: opts.browserTools !== false,
      extension: opts.extension,
      wsPort: opts.wsPort ? parseInt(opts.wsPort as string, 10) : undefined,
    });

    console.log("[MCP-WebMCP] Running in stdio mode");
    await runStdio(registry);

    const shutdown = async () => {
      console.log("\n[MCP-WebMCP] Shutting down...");
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

// ── HTTP server mode (for manual/hosted usage) ──────────────────────────────
program
  .command("start")
  .description("Start the MCP-WebMCP MCP server over HTTP")
  .option("--launch", "Launch a new browser instead of connecting via CDP")
  .option(
    "--channel <channel>",
    "Browser channel for --launch (chrome, chrome-beta, chrome-canary, msedge)",
    "chrome-beta",
  )
  .option("--headless", "Launch browser in headless mode (with --launch)")
  .option("--url <url>", "Initial URL to open in launched browser")
  .option("--cdp-host <host>", "CDP host (when not using --launch)", "localhost")
  .option("--cdp-port <port>", "CDP port (when not using --launch)", "9222")
  .option("--extension", "Enable extension WebSocket bridge")
  .option("--ws-port <port>", "Extension WebSocket port", "8765")
  .option("--port <port>", "HTTP server port", "3100")
  .option(
    "--no-browser-tools",
    "Disable Playwright browser automation tools",
  )
  .action(async (opts) => {
    const registry = await setupRegistry({
      launch: opts.launch,
      channel: opts.channel as string,
      headless: opts.headless,
      url: opts.url as string | undefined,
      cdpHost: opts.cdpHost as string,
      cdpPort: parseInt(opts.cdpPort as string, 10),
      browserTools: opts.browserTools !== false,
      extension: opts.extension,
      wsPort: opts.wsPort ? parseInt(opts.wsPort as string, 10) : undefined,
    });

    const httpPort = parseInt(opts.port as string, 10);
    createHttpServer(registry, httpPort);

    const shutdown = async () => {
      console.log("\n[MCP-WebMCP] Shutting down...");
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

// ── Utility commands ────────────────────────────────────────────────────────

program
  .command("list-tools")
  .description("List all WebMCP tools from connected browser tabs")
  .option("--host <host>", "CDP host", "localhost")
  .option("--port <port>", "CDP port", "9222")
  .action(async (opts) => {
    const source = new CdpToolSource();
    try {
      await source.connect({
        host: opts.host,
        port: parseInt(opts.port, 10),
      });
      const tools = source.listTools();

      if (tools.length === 0) {
        console.log("No WebMCP tools found.");
      } else {
        console.log(`Found ${tools.length} tool(s):\n`);
        for (const tool of tools) {
          console.log(`  ${tool.name}: ${tool.description}`);
          try {
            const schema = JSON.parse(tool.inputSchema);
            console.log(`    Input: ${JSON.stringify(schema)}`);
          } catch {
            console.log(`    Input: ${tool.inputSchema}`);
          }
          console.log();
        }
      }
    } finally {
      await source.disconnect();
    }
  });

program
  .command("call-tool <name> [args]")
  .description("Execute a WebMCP tool by name")
  .option("--host <host>", "CDP host", "localhost")
  .option("--port <port>", "CDP port", "9222")
  .action(async (name: string, args: string | undefined, opts) => {
    const source = new CdpToolSource();
    try {
      await source.connect({
        host: opts.host,
        port: parseInt(opts.port, 10),
      });

      const result = await source.callTool(name, args ?? "{}");
      for (const block of result) {
        if (block.type === "text") {
          console.log(block.text);
        } else if (block.type === "image") {
          console.log(`[Image: ${block.mimeType}, ${block.data.length} bytes base64]`);
        }
      }
    } finally {
      await source.disconnect();
    }
  });

program
  .command("config <client>")
  .description("Configure MCP client (claude, cursor)")
  .action(async (client: string) => {
    await configureMcpClient(client);
  });

program.parse();
