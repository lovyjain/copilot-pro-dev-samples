import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
import { registerWidgets } from "./resources.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "workplace-concierge",
    version: "1.0.0",
  });
  registerTools(server);
  registerWidgets(server);
  return server;
}
