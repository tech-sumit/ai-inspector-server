import { WebSocketServer, type WebSocket } from "ws";
import type {
  ToolSource,
  ToolSourceConfig,
  DiscoveredTool,
  ExtToServerMessage,
  ServerToExtMessage,
} from "@anthropic/ai-inspector-types";

/**
 * ToolSource that receives tools from the AI Inspector Chrome extension
 * via a WebSocket connection. The extension background service worker
 * connects to this server and pushes tool updates / results.
 */
export class ExtensionToolSource implements ToolSource {
  private wss: WebSocketServer | null = null;
  private pendingCalls = new Map<
    string,
    { resolve: (result: string | null) => void; reject: (err: Error) => void }
  >();
  /** Per-tab tool storage, keyed by tabId. Aggregated via listTools(). */
  private tabTools = new Map<number, DiscoveredTool[]>();
  private changeListeners = new Set<(tools: DiscoveredTool[]) => void>();
  private connections = new Set<WebSocket>();

  async connect(config: ToolSourceConfig = {}): Promise<void> {
    const port = config.wsPort ?? 8765;

    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port });

      this.wss.on("connection", (ws) => {
        this.connections.add(ws);

        ws.on("message", (raw) => {
          try {
            const msg: ExtToServerMessage = JSON.parse(raw.toString());
            this.handleMessage(msg);
          } catch {
            // Ignore malformed messages
          }
        });

        ws.on("close", () => {
          this.connections.delete(ws);
        });

        ws.on("error", () => {
          this.connections.delete(ws);
        });
      });

      this.wss.on("listening", () => {
        resolve();
      });

      this.wss.on("error", (err) => {
        reject(new Error(`WebSocket server failed to start: ${err.message}`));
      });
    });
  }

  listTools(): DiscoveredTool[] {
    const all: DiscoveredTool[] = [];
    for (const tools of this.tabTools.values()) {
      all.push(...tools);
    }
    return all;
  }

  async callTool(name: string, inputArguments: string): Promise<string | null> {
    if (!this.listTools().some((t) => t.name === name)) {
      throw new Error(`Tool "${name}" not found in extension source`);
    }

    const callId = crypto.randomUUID();
    const msg: ServerToExtMessage = {
      type: "CALL_TOOL",
      callId,
      name,
      inputArguments,
    };

    return new Promise((resolve, reject) => {
      this.pendingCalls.set(callId, { resolve, reject });
      this.broadcast(msg);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingCalls.has(callId)) {
          this.pendingCalls.delete(callId);
          reject(new Error(`Tool call "${name}" timed out after 30s`));
        }
      }, 30_000);
    });
  }

  onToolsChanged(cb: (tools: DiscoveredTool[]) => void): void {
    this.changeListeners.add(cb);
  }

  async disconnect(): Promise<void> {
    for (const [callId, pending] of this.pendingCalls) {
      pending.reject(new Error("Extension source disconnected"));
      this.pendingCalls.delete(callId);
    }

    return new Promise((resolve) => {
      if (this.wss) {
        for (const ws of this.connections) {
          ws.close();
        }
        this.wss.close(() => resolve());
        this.wss = null;
      } else {
        resolve();
      }
    });
  }

  /** Number of connected extension clients. */
  get connectionCount(): number {
    return this.connections.size;
  }

  private handleMessage(msg: ExtToServerMessage): void {
    switch (msg.type) {
      case "TOOLS_UPDATE":
        // Store tools per-tab so updates from one tab don't discard others
        this.tabTools.set(msg.tabId, msg.tools);
        {
          const allTools = this.listTools();
          for (const cb of this.changeListeners) {
            cb(allTools);
          }
        }
        break;

      case "TOOL_RESULT": {
        const pending = this.pendingCalls.get(msg.callId);
        if (pending) {
          this.pendingCalls.delete(msg.callId);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.result);
          }
        }
        break;
      }

      case "EVENT":
        // Events are informational; could be logged or forwarded
        break;
    }
  }

  private broadcast(msg: ServerToExtMessage): void {
    const data = JSON.stringify(msg);
    for (const ws of this.connections) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }
}
