import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ToolRegistry } from "./tool-registry.js";

/**
 * Create an MCP server backed by the ToolRegistry.
 *
 * Dynamically lists tools from all sources and routes callTool requests.
 * Sends tools/list_changed notifications when tools are added or removed.
 *
 * Pattern derived from playwright-mcp SDK usage.
 */
export function createMcpServer(registry: ToolRegistry): Server {
  const server = new Server(
    { name: "ai-inspector", version: "1.0.0" },
    { capabilities: { tools: { listChanged: true } } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.listTools().map((t) => {
      let inputSchema: Record<string, unknown> = { type: "object" };
      try {
        inputSchema = JSON.parse(t.inputSchema) as Record<string, unknown>;
      } catch {
        // Malformed schema — fall back to empty object schema
      }
      return {
        name: t.name,
        description: t.description,
        inputSchema,
      };
    }),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const content = await registry.callTool(
      req.params.name,
      // MCP sends parsed object; WebMCP expects DOMString
      JSON.stringify(req.params.arguments ?? {}),
    );

    return { content };
  });

  // Notify connected MCP clients when tool list changes
  registry.onChanged(() => {
    server.sendToolListChanged().catch(() => {
      // Ignore if no client is connected
    });
  });

  return server;
}
