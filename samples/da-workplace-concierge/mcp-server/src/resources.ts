import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Widget HTML is read once at startup. The build script copies src/widgets to
// dist/widgets so this path resolves both under tsx (src) and node (dist).
const widgetsDir = join(dirname(fileURLToPath(import.meta.url)), "widgets");

// text/html+skybridge marks the resource as an MCP Apps widget for hosts that
// follow the OpenAI Apps SDK conventions, which Microsoft 365 Copilot supports.
const WIDGET_MIME_TYPE = "text/html+skybridge";

// The widgets are fully self-contained, so the content security policy grants
// no external domains. Copilot renders them in a sandboxed iframe where
// external scripts, styles, and fetches would be blocked anyway.
const WIDGET_CSP = { connect_domains: [], resource_domains: [] };

interface WidgetDefinition {
  name: string;
  uri: string;
  title: string;
  file: string;
  html: string;
}

// The HTML is read once here at module load. registerWidgets runs per request
// in stateless mode, so it must not touch the disk.
const widgets: WidgetDefinition[] = [
  {
    name: "office-map-widget",
    uri: "ui://widget/office-map.html",
    title: "Office map widget",
    file: "office-map.html",
  },
  {
    name: "my-bookings-widget",
    uri: "ui://widget/my-bookings.html",
    title: "My bookings widget",
    file: "my-bookings.html",
  },
].map((widget) => ({
  ...widget,
  html: readFileSync(join(widgetsDir, widget.file), "utf8"),
}));

export function registerWidgets(server: McpServer): void {
  for (const widget of widgets) {
    const html = widget.html;
    server.registerResource(
      widget.name,
      widget.uri,
      { title: widget.title, mimeType: WIDGET_MIME_TYPE },
      async () => ({
        contents: [
          {
            uri: widget.uri,
            mimeType: WIDGET_MIME_TYPE,
            text: html,
            _meta: { "openai/widgetCSP": WIDGET_CSP },
          },
        ],
      })
    );
  }
}
