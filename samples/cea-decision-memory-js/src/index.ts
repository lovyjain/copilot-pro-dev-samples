import { startServer } from '@microsoft/agents-hosting-express'
import { buildAgentApp } from './agent/app.js'
import { Orchestrator } from './agent/orchestrator.js'
import { AzureOpenAiLlm, FakeLlm, LlmClient } from './agent/llm.js'
import { connectMcp } from './mcp/client.js'
import { loadConfig } from './config.js'
import { DecisionStore } from './store/decisionStore.js'
import { loadSeedRecords, storageFromConfig } from './store/runtimeStorage.js'

async function main(): Promise<void> {
  const config = loadConfig()
  const seed = await loadSeedRecords(config.seedPath, config.azureStorage)
  // This store only serves the in-process MCP fallback; it uses the same
  // storage backend as the standalone server, so data stays consistent.
  const storage = storageFromConfig(config)
  const store = await DecisionStore.loadFromSeed(seed.records, storage)
  console.log(`Decision seed source: ${seed.source}`)
  console.log(`Runtime decision persistence: ${storage.description}`)

  const { client: mcpClient, transport } = await connectMcp(config.mcpServerUrl, store)
  console.log(
    transport === 'http'
      ? `Connected to Decision Memory MCP server at ${config.mcpServerUrl}`
      : `MCP server at ${config.mcpServerUrl} unreachable — using in-process MCP wiring`
  )

  const llm: LlmClient = config.useFakeLlm ? new FakeLlm() : new AzureOpenAiLlm(config.azureOpenAi!)
  console.log(
    config.useFakeLlm
      ? 'LLM: offline FakeLlm (set AZURE_OPENAI_ENDPOINT + SECRET_AZURE_OPENAI_API_KEY for the real model)'
      : `LLM: Azure OpenAI deployment "${config.azureOpenAi!.deployment}"`
  )

  const app = buildAgentApp(new Orchestrator(llm, mcpClient))

  // Bot Framework credentials are required for Teams / M365 Copilot traffic
  // (the playground works without them). Warn early instead of failing with
  // opaque 401s when sideloaded.
  if (!process.env.clientId || !process.env.clientSecret) {
    console.warn(
      '⚠ No bot credentials (clientId/clientSecret) in the environment.\n' +
        '  The local Agents Playground works without them, but Teams and M365 Copilot will reject messages.\n' +
        '  For sideloaded runs: `atk provision --env local && atk deploy --env local`, then start with `npm run dev:teamsfx`.'
    )
  }

  startServer(app)
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
