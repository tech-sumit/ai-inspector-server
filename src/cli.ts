#!/usr/bin/env node

import { Command } from "commander";
import { CdpToolSource } from "@anthropic/webmcp-cdp";
import { ToolRegistry } from "./tool-registry.js";
import { ExtensionToolSource } from "./sources/extension.js";
import { createMcpServer } from "./mcp-server.js";
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
  .option("--no-cdp", "Disable CDP source")
  .action(async (opts) => {
    const registry = new ToolRegistry();

    // Connect CDP source
    if (opts.cdp !== false) {
      try {
        const cdpSource = new CdpToolSource();
        await cdpSource.connect({
          host: opts.cdpHost,
          port: parseInt(opts.cdpPort, 10),
        });

        const tools = cdpSource.listTools();
        registry.addTools(cdpSource, tools);
        cdpSource.onToolsChanged((newTools) =>
          registry.addTools(cdpSource, newTools),
        );

        console.log(
          `[AI Inspector] CDP source connected: ${tools.length} tools from ${opts.cdpHost}:${opts.cdpPort}`,
        );
      } catch (err) {
        console.warn(
          `[AI Inspector] CDP source failed to connect: ${err instanceof Error ? err.message : err}`,
        );
        console.warn(
          "[AI Inspector] Running without CDP source. Use --no-cdp to suppress this.",
        );
      }
    }

    // Connect extension source
    if (opts.extension) {
      const extSource = new ExtensionToolSource();
      await extSource.connect({ wsPort: parseInt(opts.wsPort, 10) });
      extSource.onToolsChanged((tools) =>
        registry.addTools(extSource, tools),
      );
      console.log(
        `[AI Inspector] Extension WebSocket bridge listening on ws://localhost:${opts.wsPort}`,
      );
    }

    // Create and start MCP server
    const mcpServer = createMcpServer(registry);
    const httpPort = parseInt(opts.port, 10);
    createHttpServer(mcpServer, httpPort);

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
      console.log(result);
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
