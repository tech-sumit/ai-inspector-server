import { randomUUID } from "crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { ToolRegistry } from "./tool-registry.js";
import { createMcpServer } from "./mcp-server.js";

/**
 * Create an Express HTTP server with an MCP endpoint.
 *
 * Each client session gets its own MCP Server + Transport pair,
 * all backed by the shared ToolRegistry. This allows clients to
 * disconnect and reconnect (sending a new `initialize`) without
 * hitting "Server already initialized" errors.
 *
 * @param registry - The shared tool registry
 * @param port - HTTP port (default 3100)
 */
export function createHttpServer(registry: ToolRegistry, port = 3100) {
  const app = express();
  app.use(express.json());

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "mcp-webmcp" });
  });

  app.all("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? sessions.get(sessionId) : undefined;
    let newSessionId: string | undefined;

    if (!transport) {
      // Only create a new session for initialize requests.
      // Non-initialize requests with stale/unknown session IDs get a clear error.
      const isInit =
        req.method === "POST" && req.body?.method === "initialize";

      if (!isInit && sessionId) {
        res.status(404).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Session not found. Send a new initialize request.",
          },
          id: req.body?.id ?? null,
        });
        return;
      }

      // New session — clean up any stale sessions first
      for (const [id, old] of sessions) {
        try {
          await old.close();
        } catch {
          // best-effort cleanup
        }
        sessions.delete(id);
      }

      newSessionId = randomUUID();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId!,
      });

      const mcpServer = createMcpServer(registry);
      await mcpServer.connect(transport);
    }

    try {
      await transport.handleRequest(req, res, req.body);

      // Store session after the first successful request
      if (newSessionId) {
        sessions.set(newSessionId, transport);
        console.log(`[MCP-WebMCP] New MCP session: ${newSessionId}`);
      }
    } catch (err) {
      console.error("[MCP-WebMCP] MCP request error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  const server = app.listen(port, () => {
    console.log(
      `[MCP-WebMCP] HTTP server listening on http://localhost:${port}`,
    );
    console.log(
      `[MCP-WebMCP] MCP endpoint: http://localhost:${port}/mcp`,
    );
  });

  return server;
}
