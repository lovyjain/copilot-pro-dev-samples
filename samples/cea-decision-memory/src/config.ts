import path from 'node:path'

export interface AgentConfig {
  port: number
  mcpServerUrl: string
  useFakeLlm: boolean
  azureOpenAi?: {
    endpoint: string
    apiKey: string
    deployment: string
    apiVersion: string
  }
  seedPath: string
  runtimePath: string
  azureStorage?: {
    connectionString: string
    container: string
    blobName: string
    seedBlobName: string
  }
}

/**
 * Reads configuration from the environment. When Azure OpenAI variables are
 * absent (or USE_FAKE_LLM=true), the agent runs fully offline with the
 * scripted FakeLlm — no credentials or cloud resources required.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const dataDir = path.resolve(process.cwd(), 'data')
  const endpoint = env.AZURE_OPENAI_ENDPOINT
  const apiKey = env.SECRET_AZURE_OPENAI_API_KEY ?? env.AZURE_OPENAI_API_KEY
  const hasAzure = Boolean(endpoint && apiKey)
  const storageConnectionString =
    env.SECRET_AZURE_STORAGE_CONNECTION_STRING ?? env.AZURE_STORAGE_CONNECTION_STRING

  return {
    port: Number(env.PORT ?? 3978),
    mcpServerUrl: env.MCP_SERVER_URL ?? 'http://localhost:3979/mcp',
    useFakeLlm: env.USE_FAKE_LLM === 'true' || !hasAzure,
    azureOpenAi: hasAzure
      ? {
          endpoint: endpoint!,
          apiKey: apiKey!,
          deployment: env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini',
          apiVersion: env.AZURE_OPENAI_API_VERSION ?? '2024-10-21'
        }
      : undefined,
    seedPath: path.join(dataDir, 'decisions.seed.json'),
    runtimePath: path.join(dataDir, 'decisions.runtime.json'),
    azureStorage: storageConnectionString
      ? {
          connectionString: storageConnectionString,
          container: env.AZURE_STORAGE_CONTAINER ?? 'decision-memory',
          blobName: env.AZURE_STORAGE_BLOB ?? 'decisions.runtime.json',
          seedBlobName: env.AZURE_STORAGE_SEED_BLOB ?? 'decisions.seed.json'
        }
      : undefined
  }
}
