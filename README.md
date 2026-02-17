# @tech-sumit/ai-inspector-server

MCP server that bridges browser WebMCP tools to desktop MCP clients (Cursor, Claude Desktop, etc.).

## Architecture

```
Browser tabs with WebMCP tools
         │
         ├── CdpToolSource (chrome-remote-interface, port 9222)
         │         │
         │         ▼
         │    ToolRegistry ──► McpServer ──► HTTP /mcp endpoint
         │         ▲
         │         │
         └── ExtensionToolSource (WebSocket, port 8765)
                   ▲
                   │
         AI Inspector Extension (background SW)
```

## Quick Start

```bash
# Start Chrome with debugging
chrome --remote-debugging-port=9222 --enable-features=WebMCPTesting

# Start the server
npx @tech-sumit/ai-inspector-server start

# Configure your MCP client
npx @tech-sumit/ai-inspector-server config cursor
```

## CLI

```bash
# Start server with all sources
ai-inspector start

# Start with extension bridge only (no CDP)
ai-inspector start --no-cdp --extension

# List tools
ai-inspector list-tools

# Execute a tool
ai-inspector call-tool searchFlights '{"from":"SFO","to":"JFK"}'

# Configure MCP clients
ai-inspector config cursor
ai-inspector config claude
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--cdp-host` | CDP host | localhost |
| `--cdp-port` | CDP port | 9222 |
| `--extension` | Enable extension bridge | false |
| `--ws-port` | WebSocket port | 8765 |
| `--port` | HTTP port | 3100 |
| `--no-cdp` | Disable CDP source | false |

## Docker

```bash
docker run -p 3100:3100 -p 8765:8765 ghcr.io/tech-sumit/ai-inspector-server
```

## Development

```bash
pnpm install
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
pnpm build        # tsup -> dist/
pnpm start        # node dist/cli.js start
```
