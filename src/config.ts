import { writeFile, readFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { homedir } from "os";

interface McpClientConfig {
  mcpServers: Record<
    string,
    { url?: string; command?: string; args?: string[] }
  >;
}

const CONFIG_PATHS: Record<string, string> = {
  claude: join(
    homedir(),
    "Library",
    "Application Support",
    "Claude",
    "claude_desktop_config.json",
  ),
  cursor: join(homedir(), ".cursor", "mcp.json"),
};

/**
 * Write MCP client configuration for the specified client.
 * Adds an "ai-inspector" server entry pointing to the HTTP endpoint.
 */
export async function configureMcpClient(
  client: string,
  serverUrl = "http://localhost:3100/mcp",
): Promise<void> {
  const configPath = CONFIG_PATHS[client.toLowerCase()];
  if (!configPath) {
    throw new Error(
      `Unknown MCP client: "${client}". Supported: ${Object.keys(CONFIG_PATHS).join(", ")}`,
    );
  }

  let config: McpClientConfig = { mcpServers: {} };
  try {
    const raw = await readFile(configPath, "utf-8");
    config = JSON.parse(raw);
  } catch {
    // File doesn't exist or is invalid; start fresh
  }

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  config.mcpServers["ai-inspector"] = { url: serverUrl };

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`[AI Inspector] Configured ${client} at ${configPath}`);
}
