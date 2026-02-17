import { describe, it, expect, afterEach } from "vitest";
import { ExtensionToolSource } from "../src/sources/extension.js";
import WebSocket from "ws";

describe("ExtensionToolSource", () => {
  let source: ExtensionToolSource;

  afterEach(async () => {
    if (source) await source.disconnect();
  });

  it("should start WebSocket server", async () => {
    source = new ExtensionToolSource();
    await source.connect({ wsPort: 18765 });
    expect(source.connectionCount).toBe(0);
    expect(source.listTools()).toEqual([]);
  });

  it("should accept connections and receive tool updates", async () => {
    source = new ExtensionToolSource();
    await source.connect({ wsPort: 18766 });

    const ws = new WebSocket("ws://localhost:18766");

    await new Promise<void>((resolve) => ws.on("open", resolve));
    expect(source.connectionCount).toBe(1);

    // Send tool update
    ws.send(
      JSON.stringify({
        type: "TOOLS_UPDATE",
        tabId: 1,
        url: "https://example.com",
        tools: [
          {
            name: "testTool",
            description: "A test tool",
            inputSchema: "{}",
          },
        ],
      }),
    );

    // Wait for message processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    const tools = source.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("testTool");

    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it("should notify on tool changes", async () => {
    source = new ExtensionToolSource();
    await source.connect({ wsPort: 18767 });

    const changes: unknown[] = [];
    source.onToolsChanged((tools) => changes.push(tools));

    const ws = new WebSocket("ws://localhost:18767");
    await new Promise<void>((resolve) => ws.on("open", resolve));

    ws.send(
      JSON.stringify({
        type: "TOOLS_UPDATE",
        tabId: 1,
        url: "https://example.com",
        tools: [{ name: "t1", description: "T1", inputSchema: "{}" }],
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(changes).toHaveLength(1);

    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
});
