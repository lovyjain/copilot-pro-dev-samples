import express from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { buildDecisionMcpServer } from './decisionTools.js'
import { DecisionStore } from '../store/decisionStore.js'
import { loadSeedRecords, storageFromConfig } from '../store/runtimeStorage.js'
import { loadConfig } from '../config.js'

const config = loadConfig()
const storage = storageFromConfig(config)
const seed = await loadSeedRecords(config.seedPath, config.azureStorage)
const store = await DecisionStore.loadFromSeed(seed.records, storage)
console.log(`Decision seed source: ${seed.source}`)
console.log(`Runtime decision persistence: ${storage.description}`)

const app = express()
app.use(express.json())

// Stateless mode: every request gets a fresh transport wired to the shared
// store, so no session bookkeeping is needed and curl/Inspector both work.
app.post('/mcp', async (req, res) => {
  const server = buildDecisionMcpServer(store)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    transport.close()
    server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

const methodNotAllowed: express.RequestHandler = (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. This MCP server is stateless: use POST /mcp.' },
    id: null
  })
}
app.get('/mcp', methodNotAllowed)
app.delete('/mcp', methodNotAllowed)

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, decisions: store.list().length })
})

const port = Number(process.env.MCP_PORT ?? 3979)
app.listen(port, () => {
  console.log(`Decision Memory MCP server listening on http://localhost:${port}/mcp`)
})
