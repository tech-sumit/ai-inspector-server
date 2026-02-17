export { ToolRegistry } from "./tool-registry.js";
export { createMcpServer } from "./mcp-server.js";
export { createHttpServer } from "./http.js";
export { ExtensionToolSource } from "./sources/extension.js";
export { configureMcpClient } from "./config.js";

// Re-export key types
export type {
  ToolSource,
  ToolSourceConfig,
  DiscoveredTool,
  ExtToServerMessage,
  ServerToExtMessage,
} from "@tech-sumit/ai-inspector-types";

export { CdpToolSource } from "@tech-sumit/webmcp-cdp";
