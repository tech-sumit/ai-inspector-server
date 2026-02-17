import { randomUUID } from "crypto";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";

/**
 * Create an Express HTTP server with an MCP endpoint.
 *
 * Uses the MCP SDK's StreamableHTTPServerTransport for /mcp.
 *
 * @param mcpServer - The MCP server instance
 * @param port - HTTP port (default 3100)
 */
export function createHttpServer(mcpServer: Server, port = 3100) {
  const app = createMcpExpressApp();
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "ai-inspector" });
  });

  // Stateful transport — the MCP SDK requires this to be per-session in production
  // For simplicity, we use a single transport instance
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  // Connect the MCP server to the transport
  mcpServer.connect(transport).catch((err) => {
    console.error("[AI Inspector] Failed to connect MCP server to transport:", err);
  });

  // Handle MCP requests
  app.all("/mcp", async (req, res) => {
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[AI Inspector] MCP request error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  const server = app.listen(port, () => {
    console.log(`[AI Inspector] HTTP server listening on http://localhost:${port}`);
    console.log(`[AI Inspector] MCP endpoint: http://localhost:${port}/mcp`);
  });

  return server;
}
