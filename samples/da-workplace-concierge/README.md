# Booking desks and meeting rooms with interactive MCP Apps widgets

## Summary

Workplace Concierge is a declarative agent for Microsoft 365 Copilot that helps employees plan their days in the office: find and book a desk, check meeting room availability, see who is coming in, and manage bookings.

What makes this sample different is *how* the agent answers. Its action is a remote MCP (Model Context Protocol) server that ships **MCP Apps interactive UI widgets**: instead of describing desk availability in text, Copilot renders a clickable office seat map inline in the chat. Users book a desk by selecting it on the map, and cancel bookings from an interactive list — the widgets call MCP tools directly from the UI and hand control back to the agent with follow-up messages.

![The office map widget rendered in Copilot](./assets/office-map-widget.png)

The sample demonstrates:

* A TypeScript MCP server (Streamable HTTP) that registers UI widgets as MCP resources (`ui://widget/...`, `text/html+skybridge`) and links them to tools with the `openai/outputTemplate` metadata field
* Widgets that use the host bridge (`window.openai`) to read tool output, call tools (`callTool`), send follow-up messages to the agent (`sendFollowUpMessage`), switch to full screen (`requestDisplayMode`), and adapt to the host theme — with feature detection so they degrade gracefully
* A declarative agent that connects to the MCP server through the `RemoteMCPServer` runtime in `ai-plugin.json`

## Contributors

* [Lovy Jain](https://github.com/lovyjain)

## Version history

Version|Date|Comments
-------|----|--------
1.0|July 6, 2026|Initial release

## Prerequisites

* Microsoft 365 tenant with Microsoft 365 Copilot, with custom app upload and Copilot access enabled
* [Visual Studio Code](https://code.visualstudio.com/) with the [Microsoft 365 Agents Toolkit](https://learn.microsoft.com/microsoft-365/developer/microsoft-365-agents-toolkit/install-agents-toolkit) extension (version 6.6.1 or later, required for MCP apps)
* [Node.js](https://nodejs.org/) version 18 or later
* A tunneling tool to expose the local MCP server over public HTTPS, for example the [dev tunnels CLI](https://learn.microsoft.com/azure/developer/dev-tunnels/get-started) or ngrok

## Minimal path to awesome

* Clone this repository (or [download this solution as a .ZIP file](https://pnp.github.io/download-partial/?url=https://github.com/pnp/copilot-pro-dev-samples/tree/main/samples/da-workplace-concierge) then unzip it)
* Build and start the MCP server:

```shell
cd mcp-server
npm install
npm run build
npm start
```

The server listens on `http://localhost:3000/mcp`.

* In a second terminal, expose the server over public HTTPS (Copilot can only reach public endpoints):

```shell
devtunnel host -p 3000 --allow-anonymous
```

Copy the tunnel URL, for example `https://<tunnel-id>.devtunnels.ms`.

* Open the sample folder in Visual Studio Code
* Copy `env/.env.dev.sample` to `env/.env.dev` and set `TEAMSFX_ENV=dev`, `APP_NAME_SUFFIX=dev`, and `MCP_SERVER_URL` to your tunnel URL **including the `/mcp` path**, for example `https://<tunnel-id>.devtunnels.ms/mcp`
* Select the **Microsoft 365 Agents Toolkit** icon in the Activity Bar and sign in to your Microsoft 365 account. Confirm that **Custom App Upload Enabled** and **Copilot Access Enabled** are displayed under your account
* In the **Lifecycle** pane, select **Provision**
* Go to [https://m365.cloud.microsoft/chat](https://m365.cloud.microsoft/chat) and select **Workplace Concierge** in the agents list (select **All agents** if you don't see it)
* Try one of the conversation starters, for example *Show me the office map for tomorrow so I can book a desk*. Allow the agent to connect to the MCP server when prompted
* Select an available (green) desk on the map to book it, then watch the widget hand the confirmation back to the agent

> [!NOTE]
> If you change the tools on the server, open `.vscode/mcp.json`, point it at your server URL, select **Start**, and use the **ATK: Update Action with MCP** CodeLens to regenerate the function definitions in `appPackage/ai-plugin.json`.

### About the sample data and authentication

The server keeps floors, desks, rooms, and bookings in memory and resets on restart. Because the server uses **anonymous authentication — which Microsoft 365 Copilot supports for development purposes only** — a fixed demo user (Alex Chen) stands in for the signed-in user. Before deploying anything like this to production:

* Add [OAuth 2.1 or Microsoft Entra SSO authentication](https://learn.microsoft.com/microsoft-365-copilot/extensibility/api-plugin-authentication) to the MCP server and derive the user's identity from the token
* Keep the CORS configuration in `mcp-server/src/index.ts`: Copilot renders the widgets from a sandboxed origin (`{hash}.widget-renderer.usercontent.microsoft.com`) that must be allowed for widget-initiated tool calls to reach the server

## Features

This sample illustrates the following concepts:

* Extending a declarative agent with an MCP server action using the `RemoteMCPServer` runtime in `ai-plugin.json`
* Serving **MCP Apps UI widgets** from MCP resources: `ui://widget/office-map.html` and `ui://widget/my-bookings.html` registered with the `text/html+skybridge` MIME type and a locked-down `openai/widgetCSP`
* Linking tools to widgets with the `openai/outputTemplate` tool metadata field, and returning `structuredContent` for the widget to render
* Bi-directional widget interactivity: the seat map books desks with `window.openai.callTool` and notifies the agent with `window.openai.sendFollowUpMessage`; the bookings list cancels bookings in place
* Host integration done right: feature detection for every `window.openai` API, light/dark theme support, intrinsic height notifications, and an optional full-screen mode
* Self-contained widget HTML (no external scripts, styles, or fonts) that satisfies the widget sandbox's content security policy
* A stateless Streamable HTTP MCP server in TypeScript with tools defined via the official MCP SDK

## Help

We do not support samples, but this community is always willing to help, and we want to improve these samples. We use GitHub to track issues, which makes it easy for  community members to volunteer their time and help resolve issues.

You can try looking at [issues related to this sample](https://github.com/pnp/copilot-pro-dev-samples/issues?q=label%3A%22sample%3A%20da-workplace-concierge%22) to see if anybody else is having the same issues.

If you encounter any issues using this sample, [create a new issue](https://github.com/pnp/copilot-pro-dev-samples/issues/new).

Finally, if you have an idea for improvement, [make a suggestion](https://github.com/pnp/copilot-pro-dev-samples/issues/new).

## Disclaimer

**THIS CODE IS PROVIDED *AS IS* WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTIES OF FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABILITY, OR NON-INFRINGEMENT.**

![](https://m365-visitor-stats.azurewebsites.net/copilot-pro-dev-samples/da-workplace-concierge)
