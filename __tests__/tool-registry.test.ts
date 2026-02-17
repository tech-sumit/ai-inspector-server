import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolRegistry } from "../src/tool-registry.js";
import type { ToolSource, DiscoveredTool } from "@tech-sumit/ai-inspector-types";

function mockSource(overrides?: Partial<ToolSource>): ToolSource {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    listTools: vi.fn().mockReturnValue([]),
    callTool: vi.fn().mockResolvedValue([{ type: "text", text: "null" }]),
    onToolsChanged: vi.fn(),
    ...overrides,
  };
}

const tool1: DiscoveredTool = {
  name: "searchFlights",
  description: "Search flights",
  inputSchema: '{"type":"object","properties":{"from":{"type":"string"}}}',
};

const tool2: DiscoveredTool = {
  name: "bookHotel",
  description: "Book a hotel",
  inputSchema: '{"type":"object","properties":{"city":{"type":"string"}}}',
};

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("should add and list tools", () => {
    const source = mockSource();
    registry.addTools(source, [tool1, tool2]);

    const tools = registry.listTools();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toContain("searchFlights");
    expect(tools.map((t) => t.name)).toContain("bookHotel");
  });

  it("should overwrite tools with same name from same source", () => {
    const source = mockSource();
    registry.addTools(source, [tool1]);
    registry.addTools(source, [{ ...tool1, description: "Updated" }]);

    const tools = registry.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].description).toBe("Updated");
  });

  it("should remove tools by source", () => {
    const source1 = mockSource();
    const source2 = mockSource();
    registry.addTools(source1, [tool1]);
    registry.addTools(source2, [tool2]);

    registry.removeToolsBySource(source1);
    const tools = registry.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("bookHotel");
  });

  it("should route callTool to correct source", async () => {
    const source1 = mockSource({
      callTool: vi
        .fn()
        .mockResolvedValue([{ type: "text", text: '{"flights":[]}' }]),
    });
    const source2 = mockSource();

    registry.addTools(source1, [tool1]);
    registry.addTools(source2, [tool2]);

    const result = await registry.callTool("searchFlights", '{"from":"SFO"}');
    expect(result).toEqual([{ type: "text", text: '{"flights":[]}' }]);
    expect(source1.callTool).toHaveBeenCalledWith(
      "searchFlights",
      '{"from":"SFO"}',
    );
    expect(source2.callTool).not.toHaveBeenCalled();
  });

  it("should throw for unknown tool", async () => {
    await expect(registry.callTool("nonexistent", "{}")).rejects.toThrow(
      'Unknown tool: "nonexistent"',
    );
  });

  it("should notify listeners on changes", () => {
    const listener = vi.fn();
    registry.onChanged(listener);

    const source = mockSource();
    registry.addTools(source, [tool1]);
    expect(listener).toHaveBeenCalledOnce();

    registry.removeToolsBySource(source);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("should get tool by name", () => {
    const source = mockSource();
    registry.addTools(source, [tool1]);

    expect(registry.getTool("searchFlights")).toEqual(tool1);
    expect(registry.getTool("nonexistent")).toBeUndefined();
  });

  it("should report correct size", () => {
    const source = mockSource();
    expect(registry.size).toBe(0);
    registry.addTools(source, [tool1, tool2]);
    expect(registry.size).toBe(2);
  });
});
