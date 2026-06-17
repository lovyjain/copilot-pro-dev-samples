import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildDecisionMcpServer } from './decisionTools.js'
import { DecisionStore } from '../store/decisionStore.js'

function newClient(): Client {
  return new Client({ name: 'decision-memory-agent', version: '0.1.0' })
}

/** Connect to the standalone Decision Memory MCP server over Streamable HTTP. */
export async function createHttpMcpClient(url: string): Promise<Client> {
  const client = newClient()
  await client.connect(new StreamableHTTPClientTransport(new URL(url)))
  return client
}

/**
 * Wire the MCP server and a client in-process over a linked-pair transport.
 * Used by unit tests and the offline smoke run, and as a fallback so the
 * agent still works when the HTTP MCP server isn't running.
 */
export async function createInProcessMcp(store: DecisionStore): Promise<Client> {
  const server = buildDecisionMcpServer(store)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = newClient()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client
}

/** Prefer the real HTTP MCP server; fall back to in-process wiring. */
export async function connectMcp(url: string, store: DecisionStore): Promise<{ client: Client; transport: 'http' | 'in-process' }> {
  try {
    const client = await createHttpMcpClient(url)
    return { client, transport: 'http' }
  } catch {
    const client = await createInProcessMcp(store)
    return { client, transport: 'in-process' }
  }
}
