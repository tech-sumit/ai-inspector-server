# Changelog

## 0.1.0 (2026-02-17)

### Features

- **MCP server**: Bridges browser WebMCP tools to desktop MCP clients via HTTP `/mcp` endpoint
  - `ListToolsRequestSchema` handler: converts DOMString `inputSchema` to parsed JSON objects for MCP clients
  - `CallToolRequestSchema` handler: converts MCP object arguments to JSON DOMString for WebMCP execution
  - Sends `tools/list_changed` notifications when tool sources update
- **ToolRegistry**: Central aggregation of tools from multiple sources (CDP, extension)
  - Routes `callTool` to the correct source
  - Deduplicates by tool name across sources
- **ExtensionToolSource**: WebSocket server receiving tools from Chrome extension background
  - Per-tab tool tracking to correctly aggregate tools from multiple browser tabs
  - Bidirectional tool execution: server sends `CALL_TOOL`, extension sends `TOOL_RESULT`
  - 30s timeout for pending tool calls
  - Graceful disconnect with pending call rejection
- **HTTP server**: Express-based with `StreamableHTTPServerTransport` and health check endpoint
- **CLI**: `commander`-based with `start`, `list-tools`, `call-tool`, `config` commands
- **Config utility**: Auto-configures Cursor and Claude Desktop MCP client settings
- **Docker**: Containerized deployment via Dockerfile

### Bug fixes

- **JSON body parsing**: Added `express.json()` middleware to ensure `req.body` is parsed for MCP transport
- **Schema parsing safety**: Wrapped `JSON.parse(inputSchema)` in try-catch, falls back to `{ type: "object" }` for malformed schemas
- **WebSocket startup errors**: `connect()` Promise now rejects on server-level errors (e.g., port in use) instead of hanging indefinitely
- **Tool replacement semantics**: `ToolRegistry.addTools()` removes all previous entries from a source before adding new ones, preventing stale tools from persisting after `provideContext` replacements
- **Per-tab tool aggregation**: `ExtensionToolSource` now stores tools per-tab (`Map<tabId, tools>`) instead of replacing the entire array, so updates from one tab don't discard tools from other tabs
