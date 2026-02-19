import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ToolRegistry } from "./tool-registry.js";
import { createMcpServer } from "./mcp-server.js";

/**
 * Run the MCP server over stdio (stdin/stdout).
 *
 * This is the primary mode for MCP client integration (Cursor, Claude Desktop, etc.).
 * The client spawns the process and communicates via JSON-RPC over stdio.
 *
 * IMPORTANT: All logging must go to stderr — stdout is reserved for MCP protocol messages.
 */
export async function runStdio(registry: ToolRegistry): Promise<void> {
  const server = createMcpServer(registry);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Keep the process alive until the transport closes
  transport.onclose = () => {
    process.exit(0);
  };
}
