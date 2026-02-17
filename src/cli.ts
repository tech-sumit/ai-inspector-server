#!/usr/bin/env node

import { Command } from "commander";
import { CdpToolSource } from "@tech-sumit/webmcp-cdp";
import { ToolRegistry } from "./tool-registry.js";
import { ExtensionToolSource } from "./sources/extension.js";
import { PlaywrightBrowserSource } from "./sources/browser.js";
import { createHttpServer } from "./http.js";
import { configureMcpClient } from "./config.js";

const program = new Command()
  .name("ai-inspector")
  .description("Bridge browser WebMCP tools to MCP clients")
  .version("0.1.0");

program
  .command("start")
  .description("Start the AI Inspector MCP server")
  .option("--cdp-host <host>", "CDP host", "localhost")
  .option("--cdp-port <port>", "CDP port", "9222")
  .option("--extension", "Enable extension WebSocket bridge")
  .option("--ws-port <port>", "Extension WebSocket port", "8765")
  .option("--port <port>", "HTTP server port", "3100")
  .option(
    "--no-browser-tools",
    "Disable Playwright browser automation tools",
  )
  .action(async (opts) => {
    const registry = new ToolRegistry();
    const cdpHost = opts.cdpHost as string;
    const cdpPort = parseInt(opts.cdpPort as string, 10);

    // Connect Playwright browser source (browser automation + WebMCP meta-tools)
    if (opts.browserTools !== false) {
      try {
        const browserSource = new PlaywrightBrowserSource();
        await browserSource.connect({ host: cdpHost, port: cdpPort });
        registry.addTools(browserSource, browserSource.listTools());

        console.log(
          `[AI Inspector] Browser tools enabled: ${browserSource.listTools().length} tools via Playwright`,
        );
      } catch (err) {
        console.warn(
          `[AI Inspector] Browser tools failed to connect: ${err instanceof Error ? err.message : err}`,
        );
        console.warn(
          "[AI Inspector] Running without browser tools. Use --no-browser-tools to suppress this.",
        );
      }
    }

    // Connect extension source
    if (opts.extension) {
      const extSource = new ExtensionToolSource();
      await extSource.connect({
        wsPort: parseInt(opts.wsPort as string, 10),
      });
      extSource.onToolsChanged((tools) =>
        registry.addTools(extSource, tools),
      );
      console.log(
        `[AI Inspector] Extension WebSocket bridge listening on ws://localhost:${opts.wsPort}`,
      );
    }

    // Start HTTP server (creates MCP server per session internally)
    const httpPort = parseInt(opts.port as string, 10);
    createHttpServer(registry, httpPort);

    // Graceful shutdown
    const shutdown = async () => {
      console.log("\n[AI Inspector] Shutting down...");
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

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
  .option("--url <url>", "Server URL", "http://localhost:3100/mcp")
  .action(async (client: string, opts) => {
    await configureMcpClient(client, opts.url);
  });

program.parse();
