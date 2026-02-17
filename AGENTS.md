# ai-inspector-server

MCP server bridging browser WebMCP tools to desktop MCP clients.

## Architecture
- ToolRegistry aggregates tools from CdpToolSource and ExtensionToolSource
- MCP server uses @modelcontextprotocol/sdk with ListTools + CallTool handlers
- Streamable HTTP transport on /mcp (not stdio)
- CLI wraps server functionality via commander

## Key type conversions
- WebMCP uses DOMString (JSON strings) for inputSchema and tool args
- MCP uses parsed objects for inputSchema and arguments
- Server must JSON.parse inputSchema when sending to MCP clients
- Server must JSON.stringify arguments when calling WebMCP tools

## Sources
- CdpToolSource (from @anthropic/webmcp-cdp) — direct CDP connection to Chrome
- ExtensionToolSource — WebSocket server that accepts connections from the extension

## CLI commands
- `ai-inspector start` — Start the server (CDP + optional extension bridge)
- `ai-inspector list-tools` — List all tools (CDP only)
- `ai-inspector call-tool <name> [args]` — Execute a tool (CDP only)
- `ai-inspector config <client>` — Configure MCP client (claude, cursor)

## Testing
- Unit tests mock ToolSource interface
- Extension source tests use real WebSocket connections
- Integration tests need Chrome with WebMCPTesting flag
