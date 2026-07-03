# IQ Bridge - a declarative agent that uses Work IQ and Foundry IQ across two Microsoft Entra directories

## Summary

IQ Bridge is a declarative agent for Microsoft 365 Copilot that answers questions from two complementary knowledge systems:

* **Work IQ** - the intelligence layer behind Microsoft 365 Copilot. The agent uses the built-in knowledge capabilities (`Email`, `TeamsMessages`, `OneDriveAndSharePoint`, `People`) so it can reason over the signed-in user's emails, Teams messages, documents, and colleagues. This runs entirely in the tenant where your Microsoft 365 Copilot license lives.
* **Foundry IQ** - a knowledge base hosted by Azure AI Search (agentic retrieval, part of Microsoft Foundry). The agent calls the knowledge base's `retrieve` REST endpoint through an API plugin action secured with an API key.

The key scenario this sample demonstrates: **your Microsoft 365 Copilot license and your Azure subscription are in two different Microsoft Entra directories (tenants)**. Because the Foundry IQ knowledge base is called with an Azure AI Search API key - not a Microsoft Entra token - no cross-tenant app registration, multi-tenant consent, or B2B guest setup is needed. The agent runs in the Copilot tenant; the knowledge base runs in the Azure tenant; the API key bridges the two.

![IQ Bridge answering a question grounded in a Foundry IQ knowledge base](./assets/iq-bridge.png)

## Architecture

```text
Microsoft Entra directory A                Microsoft Entra directory B
(Microsoft 365 Copilot license)            (Azure subscription)
┌─────────────────────────────┐            ┌──────────────────────────────┐
│  Microsoft 365 Copilot      │            │  Azure AI Search              │
│  ┌───────────────────────┐  │            │  ┌────────────────────────┐  │
│  │ IQ Bridge (this DA)   │  │  api-key   │  │ Foundry IQ             │  │
│  │  • Work IQ knowledge  │──┼────────────┼─▶│ knowledge base         │  │
│  │    (Email, Teams,     │  │  POST      │  │  /knowledgebases/{kb}  │  │
│  │    SharePoint, People)│  │  /retrieve │  │  /retrieve             │  │
│  │  • Foundry IQ action  │  │            │  └────────────────────────┘  │
│  └───────────────────────┘  │            │   knowledge sources: blobs,  │
└─────────────────────────────┘            │   indexes, web, MCP, ...     │
                                           └──────────────────────────────┘
```

* Questions about the user's own work (mail, chats, documents, people) are answered by Copilot's native Work IQ grounding - no extra infrastructure.
* Questions about curated reference knowledge are routed to the `retrieveFoundryKnowledge` action, which posts the query to the knowledge base's agentic retrieval endpoint in the Azure tenant.
* The Azure AI Search query API key is stored in the Teams Developer Portal key vault (`ApiKeyPluginVault`) during provisioning - it never appears in the manifest, the repo, or the client.

## Frameworks

![drop](https://img.shields.io/badge/Microsoft&nbsp;365&nbsp;Agents&nbsp;Toolkit-CLI-green.svg)
![drop](https://img.shields.io/badge/Declarative&nbsp;Agent&nbsp;Manifest-1.7-green.svg)
![drop](https://img.shields.io/badge/API&nbsp;Plugin&nbsp;Manifest-2.4-green.svg)

## Prerequisites

* **Directory A (work tenant)**: a [Microsoft 365 tenant](https://learn.microsoft.com/microsoft-365-copilot/extensibility/prerequisites) with a **Microsoft 365 Copilot license** and permission to sideload custom apps.
* **Directory B (Azure tenant)**: an **Azure subscription** with an [Azure AI Search](https://learn.microsoft.com/azure/search/search-what-is-azure-search) service (Basic tier or higher) and a [Foundry IQ knowledge base](https://learn.microsoft.com/azure/search/agentic-retrieval-how-to-create-knowledge-base) created on it. The two directories do **not** need any trust relationship.
* [Microsoft 365 Agents Toolkit CLI](https://learn.microsoft.com/microsoftteams/platform/toolkit/microsoft-365-agents-toolkit-cli) (`npm install -g @microsoft/m365agentstoolkit-cli`) or the Agents Toolkit extension for VS Code.

## Version history

Version|Date|Author|Comments
-------|----|----|--------
1.0|July 3, 2026|Lovy Jain|Initial release

## Disclaimer

**THIS CODE IS PROVIDED *AS IS* WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTIES OF FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABILITY, OR NON-INFRINGEMENT.**

---

## Minimal Path to Awesome

### Step 1 - Create the Foundry IQ knowledge base (directory B, Azure)

1. Sign in to the [Azure portal](https://portal.azure.com) with your **Azure tenant** account and create (or reuse) an **Azure AI Search** service, Basic tier or higher.
1. Create a knowledge base with at least one knowledge source (for example a blob container of product documentation, or an existing search index). You can do this in the [Microsoft Foundry portal](https://ai.azure.com) or by following [Create a knowledge base in Azure AI Search](https://learn.microsoft.com/azure/search/agentic-retrieval-how-to-create-knowledge-base). Note the **knowledge base name**.
1. In the search service, go to **Settings > Keys** and:
    * make sure **API access control** allows API keys (**Both** or **API keys**), and
    * copy a **query key** (query keys are read-only; avoid admin keys).

### Step 2 - Configure this sample

1. Clone this repository and open the `samples/da-foundry-work-iq` folder.
1. In `env/.env.dev` set:
    * `FOUNDRY_IQ_SEARCH_ENDPOINT` - your search service URL, for example `https://contoso-search.search.windows.net`
    * `FOUNDRY_IQ_KNOWLEDGE_BASE_NAME` - the knowledge base name from step 1

### Step 3 - Provision to the Copilot tenant (directory A, Microsoft 365)

1. Sign in to the Agents Toolkit with your **Microsoft 365 Copilot tenant** account (not the Azure one):

    ```bash
    atk auth login m365
    ```

1. Provision the agent:

    ```bash
    atk provision --env dev
    ```

    During provisioning the `apiKey/register` step prompts for an API key - paste the **Azure AI Search query key** from step 1. The key is stored in the Teams Developer Portal vault and only its registration ID is written to `env/.env.dev`.

1. Open [Microsoft 365 Copilot](https://m365.cloud.microsoft/chat), select **IQ Bridge** from the agent list, and try the conversation starters.

## Features

This sample illustrates the following concepts:

* Building a declarative agent that combines **Work IQ knowledge capabilities** (`Email`, `TeamsMessages`, `OneDriveAndSharePoint`, `People`) with a custom **API plugin action**
* Calling the **Foundry IQ / Azure AI Search agentic retrieval** REST endpoint (`POST /knowledgebases/{name}/retrieve`, API version `2026-04-01`) from a Copilot action
* **Cross-directory (cross-tenant) knowledge access**: the Copilot license and the Azure subscription live in different Microsoft Entra directories, bridged with an API key so no cross-tenant Entra configuration is required
* Securing a plugin with **`ApiKeyPluginVault`** so the key is stored in the Microsoft token store instead of the manifest or source control
* Instruction-based **routing between knowledge sources**, with source attribution in answers

### Notes and possible improvements

* **Entra-protected knowledge bases**: if you later consolidate both workloads into one directory (or set up a multi-tenant app), you can switch the action to `OAuthPluginVault` and call the knowledge base with a Microsoft Entra token instead of an API key, assigning the caller the **Search Index Data Reader** role. That removes key management entirely.
* **MCP alternative**: a Foundry IQ knowledge base also exposes an MCP endpoint (`/knowledgebases/{name}/mcp`) with a `knowledge_base_retrieve` tool. The same agent could consume it with a `RemoteMCPServer` runtime; this sample uses the REST endpoint because API-key auth with a typed OpenAPI contract is the simplest reliable path across two directories.
* **Work IQ APIs**: for custom engine agents (your own code instead of a declarative agent), the [Work IQ APIs](https://learn.microsoft.com/microsoft-365/copilot/extensibility/work-iq/) expose the same Microsoft 365 intelligence via REST, MCP, and A2A. A declarative agent gets Work IQ grounding natively, which is why this sample needs no code for the Microsoft 365 side.
* **SharePoint knowledge sources**: if the knowledge base uses a *remote SharePoint* knowledge source, document-level security requires forwarding the user's token in `x-ms-query-source-authorization`, which an API-key plugin cannot do. Use tenant-agnostic sources (blob, search index, web) for the cross-directory scenario.

## Help

We do not support samples, but this community is always willing to help, and we want to improve these samples. We use GitHub to track issues, which makes it easy for community members to volunteer their time and help resolve issues.

You can try looking at [issues related to this sample](https://github.com/pnp/copilot-pro-dev-samples/issues?q=label%3A%22sample%3A%20da-foundry-work-iq%22) to see if anybody else is having the same issues.

If you encounter any issues using this sample, [create a new issue](https://github.com/pnp/copilot-pro-dev-samples/issues/new).

Finally, if you have an idea for improvement, [make a suggestion](https://github.com/pnp/copilot-pro-dev-samples/issues/new).

<img src="https://m365-visitor-stats.azurewebsites.net/copilot-pro-dev-samples/samples/da-foundry-work-iq" />
