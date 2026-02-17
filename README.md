# @tech-sumit/ai-inspector-server

MCP server that gives AI agents full browser automation and [WebMCP](https://AIdevelopment.blog/web-mcp) tool access. Connects to a running Chrome instance via Playwright and exposes 25 tools over the Model Context Protocol.

## Architecture

```mermaid
graph TD
    Chrome["Chrome 146+<br/><code>--remote-debugging-port=9222</code><br/><code>--enable-features=WebMCPTesting</code>"]

    subgraph AI Inspector Server
        PB["PlaywrightBrowserSource<br/>23 browser tools + 2 WebMCP meta-tools"]
        EXT["ExtensionToolSource<br/>(optional, WebSocket :8765)"]
        TR[ToolRegistry]
        MCP["MCP Server<br/>(per-session)"]
        HTTP["HTTP /mcp endpoint<br/>:3100"]
    end

    Chrome -- "CDP :9222" --> PB
    PB --> TR
    EXT --> TR
    TR --> MCP
    MCP --> HTTP

    HTTP --> Cursor["Cursor<br/>(via supergateway)"]
    HTTP --> Claude["Claude Desktop"]
    HTTP --> Other["Any MCP Client"]

    ExtBrowser["AI Inspector<br/>Chrome Extension"] -. "WebSocket :8765" .-> EXT
```

### Tool Flow

```mermaid
sequenceDiagram
    participant Agent as MCP Client (AI Agent)
    participant Server as AI Inspector Server
    participant PW as Playwright
    participant Chrome as Chrome Browser
    participant Page as Web Page

    Agent->>Server: tools/call browser_snapshot
    Server->>PW: page.locator("body").ariaSnapshot()
    PW->>Chrome: CDP command
    Chrome-->>PW: Accessibility tree
    PW-->>Server: ARIA snapshot text
    Server-->>Agent: Annotated tree with [ref=N]

    Agent->>Server: tools/call browser_click {ref: 5}
    Server->>PW: locator.click()
    PW->>Chrome: Click element
    Chrome->>Page: DOM click event
    Page-->>Chrome: Updated DOM
    Chrome-->>PW: Action complete
    PW-->>Server: Success
    Server-->>Agent: "Clicked button [ref=5]"

    Agent->>Server: tools/call webmcp_list_tools
    Server->>PW: page.evaluate(navigator.modelContextTesting.listTools())
    PW->>Page: Execute in page context
    Page-->>PW: Tool definitions
    PW-->>Server: Tool list JSON
    Server-->>Agent: Available WebMCP tools
```

## Prerequisites

| Requirement | Details |
|---|---|
| **Node.js** | v18+ |
| **Chrome** | Version **146+** (Beta or Canary). Stable Chrome will not work until WebMCP ships. |
| **Playwright browsers** | Installed via `npx playwright install chromium` (only needed once) |

### Checking your Chrome version

```bash
# macOS — Chrome Beta
/Applications/Google\ Chrome\ Beta.app/Contents/MacOS/Google\ Chrome\ Beta --version

# macOS — Chrome Canary
/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary --version

# Linux
google-chrome-beta --version
```

The server validates Chrome >= 146 on startup and will throw a clear error if the version is too old.

## Setup

### Setup Overview

```mermaid
graph LR
    A["1. Launch Chrome<br/>with flags"] --> B["2. Start AI Inspector<br/>Server"]
    B --> C["3. Configure MCP<br/>Client"]
    C --> D["Agent uses<br/>25 tools"]

    style A fill:#e1f5fe
    style B fill:#e8f5e9
    style C fill:#fff3e0
    style D fill:#f3e5f5
```

### 1. Launch Chrome with remote debugging and WebMCP

Chrome must be started with two flags:

- `--remote-debugging-port=9222` — allows Playwright to connect
- `--enable-features=WebMCPTesting` — enables `navigator.modelContextTesting` for WebMCP tools

```bash
# macOS — Chrome Beta
/Applications/Google\ Chrome\ Beta.app/Contents/MacOS/Google\ Chrome\ Beta \
  --remote-debugging-port=9222 \
  --enable-features=WebMCPTesting

# macOS — Chrome Canary
/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary \
  --remote-debugging-port=9222 \
  --enable-features=WebMCPTesting

# Linux
google-chrome-beta \
  --remote-debugging-port=9222 \
  --enable-features=WebMCPTesting

# Windows
"C:\Program Files\Google\Chrome Beta\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --enable-features=WebMCPTesting
```

> **Tip:** Close all existing Chrome windows before running this command, or Chrome will connect to the existing instance which may not have the flags enabled.

Verify Chrome is listening:

```bash
curl http://localhost:9222/json/version
```

You should see a JSON response with `"Browser": "Chrome/146.x.x.x"`.

### 2. Install and start the server

```bash
# From the monorepo
cd projects/webmcp/ai-inspector-server
pnpm install
pnpm build
pnpm start

# Or run directly
node dist/cli.js start
```

On successful startup you'll see:

```
[AI Inspector] Chrome version: 146.0.7680.0 (>= 146 required)
[AI Inspector] WebMCP (navigator.modelContextTesting) is available
[AI Inspector] Browser tools enabled: 25 tools via Playwright
[AI Inspector] HTTP server listening on http://localhost:3100
[AI Inspector] MCP endpoint: http://localhost:3100/mcp
```

#### Startup Checks

```mermaid
flowchart TD
    Start([Server Start]) --> ConnectCDP["Connect to Chrome via CDP :9222"]
    ConnectCDP --> CheckVer{"Chrome version<br/>≥ 146?"}
    CheckVer -- No --> ErrVer["<b>Hard Error</b><br/>Server will not start<br/><i>Install Chrome Beta/Canary</i>"]
    CheckVer -- Yes --> CheckMCP{"WebMCP enabled?<br/><code>navigator.modelContextTesting</code>"}
    CheckMCP -- No --> WarnMCP["<b>Warning</b><br/>Server starts without WebMCP<br/><i>webmcp_list_tools / webmcp_call_tool</i><br/><i>will return errors</i>"]
    CheckMCP -- Yes --> Ready(["Server Ready<br/>25 tools available"])
    WarnMCP --> ReadyPartial(["Server Ready<br/>23 browser tools only"])

    style ErrVer fill:#ffcdd2
    style WarnMCP fill:#fff9c4
    style Ready fill:#c8e6c9
    style ReadyPartial fill:#fff9c4
```

### 3. Connect your MCP client

#### Client Connection Options

```mermaid
graph LR
    Server["AI Inspector<br/>HTTP :3100/mcp"]

    Server -- "Streamable HTTP" --> Cursor["Cursor"]
    Server -- "Streamable HTTP" --> Claude["Claude Desktop"]
    Server -- "Streamable HTTP" --> Any["Any MCP Client"]
```

All clients connect via **Streamable HTTP** — no bridges or adapters needed.

#### Cursor

```bash
ai-inspector config cursor
```

Or manually add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ai-inspector": {
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

Then restart Cursor or toggle the MCP server off/on in Cursor Settings > MCP.

#### Claude Desktop

```bash
ai-inspector config claude
```

Or manually add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ai-inspector": {
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

#### Any MCP client

Point your client to:

```
http://localhost:3100/mcp
```

The server supports the MCP Streamable HTTP transport with per-session state.

## Available Tools (25)

### Tool Categories

```mermaid
graph TD
    subgraph "Browser Automation (23 tools)"
        direction LR
        Nav["Navigation<br/><code>navigate</code> <code>back</code> <code>forward</code> <code>reload</code>"]
        State["Page State<br/><code>url</code> <code>snapshot</code> <code>screenshot</code><br/><code>console_logs</code> <code>network_requests</code>"]
        Interact["Interaction<br/><code>click</code> <code>type</code> <code>fill</code> <code>hover</code><br/><code>select_option</code> <code>press_key</code> <code>focus</code>"]
        Scroll["Scrolling<br/><code>scroll</code>"]
        Tabs["Tab Management<br/><code>tab_list</code> <code>tab_new</code><br/><code>tab_select</code> <code>tab_close</code>"]
        JS["JavaScript<br/><code>evaluate</code>"]
        Wait["Wait<br/><code>wait</code>"]
    end

    subgraph "WebMCP Meta-Tools (2 tools)"
        direction LR
        List["<code>webmcp_list_tools</code><br/>Discover page tools"]
        Call["<code>webmcp_call_tool</code><br/>Execute page tools"]
    end
```

### Browser Automation (23 tools)

| Tool | Description |
|---|---|
| `browser_navigate` | Navigate to a URL |
| `browser_back` | Go back in history |
| `browser_forward` | Go forward in history |
| `browser_reload` | Reload current page |
| `browser_url` | Get current URL and title |
| `browser_snapshot` | Accessibility tree with `[ref=N]` markers for element targeting |
| `browser_screenshot` | Take a PNG screenshot |
| `browser_console_logs` | Get buffered console log messages |
| `browser_network_requests` | Get buffered network requests with status codes |
| `browser_click` | Click an element by ref |
| `browser_type` | Type text character by character |
| `browser_fill` | Clear and fill an input field |
| `browser_hover` | Hover over an element |
| `browser_select_option` | Select a dropdown option |
| `browser_press_key` | Press a keyboard key |
| `browser_focus` | Focus an element |
| `browser_scroll` | Scroll page or element |
| `browser_tab_list` | List all open tabs |
| `browser_tab_new` | Open a new tab |
| `browser_tab_select` | Switch to a tab |
| `browser_tab_close` | Close a tab |
| `browser_evaluate` | Execute JavaScript in page context |
| `browser_wait` | Wait for time or CSS selector |

### WebMCP Meta-Tools (2 tools)

| Tool | Description |
|---|---|
| `webmcp_list_tools` | List WebMCP tools registered on the active page |
| `webmcp_call_tool` | Execute a WebMCP tool by name on the active page |

WebMCP tools are **dynamic** — they change as the user navigates between pages. Always call `webmcp_list_tools` before `webmcp_call_tool` to discover what's available.

### Element Targeting: Snapshot + Ref

```mermaid
sequenceDiagram
    participant Agent
    participant Server
    participant Page

    Agent->>Server: browser_snapshot
    Server->>Page: ariaSnapshot()
    Page-->>Server: Accessibility tree
    Note over Server: Assigns [ref=N] to each element<br/>Stores role + name + nth mapping
    Server-->>Agent: Annotated snapshot

    Note over Agent: Agent reads snapshot,<br/>picks ref=5 for "Submit" button

    Agent->>Server: browser_click {ref: 5}
    Note over Server: Resolves ref=5 → getByRole("button", {name: "Submit"}).nth(0)
    Server->>Page: Click resolved locator
    Page-->>Server: Done
    Server-->>Agent: "Clicked button 'Submit' [ref=5]"
```

## CLI Reference

### `ai-inspector start`

Start the MCP server.

```bash
ai-inspector start [options]
```

| Option | Description | Default |
|---|---|---|
| `--cdp-host <host>` | Chrome debugging host | `localhost` |
| `--cdp-port <port>` | Chrome debugging port | `9222` |
| `--port <port>` | HTTP server port | `3100` |
| `--extension` | Enable Chrome extension WebSocket bridge | `false` |
| `--ws-port <port>` | Extension WebSocket port | `8765` |
| `--no-browser-tools` | Disable Playwright browser automation | `false` |

### `ai-inspector list-tools`

List all WebMCP tools from connected browser tabs (uses CDP directly).

```bash
ai-inspector list-tools [--host localhost] [--port 9222]
```

### `ai-inspector call-tool <name> [args]`

Execute a WebMCP tool by name.

```bash
ai-inspector call-tool searchFlights '{"from":"SFO","to":"JFK"}'
```

### `ai-inspector config <client>`

Write MCP client configuration.

```bash
ai-inspector config cursor   # writes ~/.cursor/mcp.json
ai-inspector config claude    # writes Claude Desktop config
```

## Example: End-to-End Demo

### Setup Terminals

```mermaid
gantt
    title Terminal Setup
    dateFormat X
    axisFormat %s

    section Terminal 1
    Launch Chrome with flags       :a1, 0, 5

    section Terminal 2
    Start WebMCP demo app (port 4200) :a2, 2, 7

    section Terminal 3
    Start AI Inspector server      :a3, 4, 9

    section Terminal 4
    Open demo in Chrome tab        :a4, 6, 8
```

```bash
# Terminal 1 — Launch Chrome
/Applications/Google\ Chrome\ Beta.app/Contents/MacOS/Google\ Chrome\ Beta \
  --remote-debugging-port=9222 \
  --enable-features=WebMCPTesting

# Terminal 2 — Start a WebMCP demo app
cd projects/webmcp/library/demos/french-bistro
pnpm dev --port 4200

# Terminal 3 — Start the AI Inspector server
cd projects/webmcp/ai-inspector-server
pnpm start

# Terminal 4 — Navigate Chrome to the demo
curl -X PUT "http://localhost:9222/json/new?http://localhost:4200"
```

### Agent Workflow

```mermaid
sequenceDiagram
    participant Agent as AI Agent (Cursor)
    participant MCP as AI Inspector
    participant Chrome as Chrome + Demo Page

    Agent->>MCP: browser_navigate {url: "http://localhost:4200"}
    MCP->>Chrome: Navigate
    Chrome-->>MCP: Page loaded
    MCP-->>Agent: "Navigated to localhost:4200"

    Agent->>MCP: webmcp_list_tools
    MCP->>Chrome: navigator.modelContextTesting.listTools()
    Chrome-->>MCP: [{name: "book_table_le_petit_bistro", ...}]
    MCP-->>Agent: Tool definitions with input schemas

    Agent->>MCP: webmcp_call_tool {name: "book_table_le_petit_bistro", arguments: {...}}
    MCP->>Chrome: navigator.modelContextTesting.executeTool(...)
    Chrome-->>MCP: Form filled and submitted
    MCP-->>Agent: Reservation confirmed

    Agent->>MCP: browser_snapshot
    MCP->>Chrome: ariaSnapshot()
    Chrome-->>MCP: Accessibility tree
    MCP-->>Agent: Confirmation modal visible
```

## Session Management

```mermaid
sequenceDiagram
    participant Client as MCP Client (Cursor / Claude)
    participant Server as AI Inspector HTTP :3100

    Client->>Server: POST /mcp {method: "initialize"}
    Note over Server: Creates new session<br/>UUID + Transport + MCP Server
    Server-->>Client: {sessionId: "abc-123", capabilities: {...}}

    Client->>Server: POST /mcp {method: "tools/list"}<br/>Header: mcp-session-id: abc-123
    Server-->>Client: {tools: [...25 tools]}

    Client->>Server: POST /mcp {method: "tools/call", name: "browser_snapshot"}<br/>Header: mcp-session-id: abc-123
    Server-->>Client: {content: [{type: "text", text: "...accessibility tree..."}]}

    Note over Client, Server: On server restart, old session is invalid

    Client->>Server: POST /mcp {method: "tools/list"}<br/>Header: mcp-session-id: abc-123
    Note over Server: Session "abc-123" not found,<br/>not an initialize request
    Server-->>Client: 404 "Session not found"
    Note over Client: Reconnects automatically
    Client->>Server: POST /mcp {method: "initialize"}
    Note over Server: Creates new session
    Server-->>Client: {sessionId: "def-456"}
```

## Troubleshooting

### Decision Tree

```mermaid
flowchart TD
    Problem([Something went wrong]) --> Q1{"Can you reach Chrome?<br/><code>curl localhost:9222/json/version</code>"}
    Q1 -- No --> F1["Launch Chrome with<br/><code>--remote-debugging-port=9222</code>"]
    Q1 -- Yes --> Q2{"Chrome version ≥ 146?"}
    Q2 -- No --> F2["Install Chrome Beta/Canary<br/>chrome.google.com/beta"]
    Q2 -- Yes --> Q3{"Server starts?"}
    Q3 -- No --> F3["Check port 3100 is free<br/><code>lsof -ti:3100</code>"]
    Q3 -- Yes --> Q4{"MCP client connects?"}
    Q4 -- No --> F4["Check mcp.json config<br/>Toggle MCP off/on"]
    Q4 -- Yes --> Q5{"WebMCP tools work?"}
    Q5 -- No --> F5["Relaunch Chrome with<br/><code>--enable-features=WebMCPTesting</code>"]
    Q5 -- Yes --> OK(["Everything working"])

    style F1 fill:#ffcdd2
    style F2 fill:#ffcdd2
    style F3 fill:#ffcdd2
    style F4 fill:#ffcdd2
    style F5 fill:#ffcdd2
    style OK fill:#c8e6c9
```

### Common Issues

#### "Chrome version X is not supported"

Your Chrome is older than 146. Install Chrome Beta or Canary:
- https://www.google.com/chrome/beta/
- https://www.google.com/chrome/canary/

#### "WebMCP is NOT available"

Chrome was not launched with `--enable-features=WebMCPTesting`. Close all Chrome windows and relaunch with the flag.

#### "No browser contexts found"

Chrome is not running with `--remote-debugging-port=9222`, or it has no tabs open. Verify with:

```bash
curl http://localhost:9222/json/version
```

#### "Server not initialized" errors in MCP client

This happens when the MCP client tries to reuse a stale session after the server restarts. Toggle the MCP server off and on in your client settings, or restart the client.

#### Screenshot timeouts

Playwright waits for web fonts to load before taking screenshots. The server uses a 10-second timeout to avoid hanging. If screenshots still time out on slow connections, the page will be captured as-is after the timeout.

#### Click fails on modal/overlay elements

Elements in `position: fixed` overlays may not be scrollable into view. The server automatically retries with `force: true` to click at the element's coordinates directly.

## Development

```bash
pnpm install           # install dependencies
pnpm build             # compile with tsup → dist/
pnpm dev               # watch mode
pnpm start             # run the server
pnpm typecheck         # tsc --noEmit
pnpm lint              # eslint
pnpm test              # vitest
pnpm format            # prettier
```

## License

MIT
