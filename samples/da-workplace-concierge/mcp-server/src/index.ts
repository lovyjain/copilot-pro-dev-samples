import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

const app = express();
app.use(express.json());

// Copilot renders the widgets in a sandboxed iframe served from
// {sha256-of-mcp-domain}.widget-renderer.usercontent.microsoft.com, so that
// origin must be allowed for the widget's callTool requests to reach the
// server. Localhost is allowed for MCP Inspector and local testing.
app.use(
  cors({
    origin: [/\.widget-renderer\.usercontent\.microsoft\.com$/, /^https?:\/\/localhost(:\d+)?$/],
    allowedHeaders: ["Content-Type", "Mcp-Session-Id", "MCP-Protocol-Version", "Authorization"],
    exposedHeaders: ["Mcp-Session-Id"],
  })
);

// Stateless mode: a fresh server and transport per request avoids session
// affinity issues behind dev tunnels. Booking state still persists across
// requests because the data module is a process-wide singleton.
app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed. This server runs in stateless mode; use POST." });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed. This server runs in stateless mode; use POST." });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Workplace Concierge MCP server listening on http://localhost:${port}/mcp`);
});
