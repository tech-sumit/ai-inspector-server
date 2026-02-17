import { describe, it, expect, vi, beforeEach } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ToolRegistry } from "../src/tool-registry.js";
import { createMcpServer } from "../src/mcp-server.js";
import type { ToolSource, DiscoveredTool } from "@tech-sumit/ai-inspector-types";

function mockSource(overrides?: Partial<ToolSource>): ToolSource {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    listTools: vi.fn().mockReturnValue([]),
    callTool: vi.fn().mockResolvedValue('{"result":"ok"}'),
    onToolsChanged: vi.fn(),
    ...overrides,
  };
}

const tool: DiscoveredTool = {
  name: "makeReservation",
  description: "Make a reservation",
  inputSchema: '{"type":"object","properties":{"name":{"type":"string"}}}',
};

describe("createMcpServer", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("should create a server with tools capability", () => {
    const server = createMcpServer(registry);
    expect(server).toBeDefined();
  });

  it("should be an instance of Server", () => {
    const server = createMcpServer(registry);
    expect(server).toBeInstanceOf(Server);
  });

  it("should integrate with tool registry", () => {
    const source = mockSource();
    registry.addTools(source, [tool]);

    const server = createMcpServer(registry);
    expect(server).toBeDefined();

    // Verify registry has the tool
    expect(registry.listTools()).toHaveLength(1);
    expect(registry.listTools()[0].name).toBe("makeReservation");
  });
});
