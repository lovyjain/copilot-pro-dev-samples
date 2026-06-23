import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { BlobServiceClient, ContainerClient, RestError } from '@azure/storage-blob'
import { DecisionRecord } from './types.js'

/**
 * Persistence backend for records created at runtime. The seed file is always
 * read from the local repo; only runtime records go through this interface,
 * so swapping backends never touches the agent, orchestrator, or MCP tools.
 */
export interface RuntimeStorage {
  /** Where the data lives, for startup logs. */
  readonly description: string
  load(): Promise<DecisionRecord[]>
  save(records: DecisionRecord[]): Promise<void>
}

/** Default zero-credential backend: a gitignored JSON file next to the seed. */
export class FileRuntimeStorage implements RuntimeStorage {
  readonly description: string

  constructor(private readonly path: string) {
    this.description = `local file ${path}`
  }

  async load(): Promise<DecisionRecord[]> {
    if (!existsSync(this.path)) return []
    return JSON.parse(readFileSync(this.path, 'utf-8')) as DecisionRecord[]
  }

  async save(records: DecisionRecord[]): Promise<void> {
    writeFileSync(this.path, JSON.stringify(records, null, 2))
  }
}

/**
 * Backend selection: an Azure Storage connection string in the environment
 * switches persistence to Blob Storage; otherwise the gitignored local file
 * keeps the zero-credential quickstart working.
 */
export function storageFromConfig(config: {
  runtimePath: string
  azureStorage?: AzureBlobStorageConfig
}): RuntimeStorage {
  return config.azureStorage
    ? new BlobRuntimeStorage(config.azureStorage)
    : new FileRuntimeStorage(config.runtimePath)
}

export interface AzureBlobStorageConfig {
  connectionString: string
  container: string
  blobName: string
  seedBlobName?: string
}

function loadSeedFromFile(seedPath: string): DecisionRecord[] {
  return JSON.parse(readFileSync(seedPath, 'utf-8')) as DecisionRecord[]
}

export interface LoadedSeedRecords {
  records: DecisionRecord[]
  source: string
}

/**
 * Loads committed seed records from local disk by default. When Azure Storage
 * is configured, seed records are loaded from the configured seed blob.
 */
export async function loadSeedRecords(
  seedPath: string,
  azureStorage?: AzureBlobStorageConfig
): Promise<LoadedSeedRecords> {
  if (!azureStorage) {
    return {
      records: loadSeedFromFile(seedPath),
      source: `local file ${seedPath}`
    }
  }

  const service = BlobServiceClient.fromConnectionString(azureStorage.connectionString)
  const container = service.getContainerClient(azureStorage.container)
  const seedBlobName = azureStorage.seedBlobName ?? 'decisions.seed.json'

  try {
    const buffer = await container.getBlockBlobClient(seedBlobName).downloadToBuffer()
    return {
      records: JSON.parse(buffer.toString('utf-8')) as DecisionRecord[],
      source: `Azure Blob Storage (container "${azureStorage.container}", blob "${seedBlobName}")`
    }
  } catch (err) {
    if (err instanceof RestError && err.statusCode === 404) {
      throw new Error(
        `Seed blob "${seedBlobName}" was not found in container "${azureStorage.container}".`
      )
    }
    throw err
  }
}

/**
 * Durable backend for deployed environments: one JSON blob in an Azure
 * Storage account. The container is created on first use, and a missing
 * blob reads as an empty store, so a fresh account needs no setup.
 */
export class BlobRuntimeStorage implements RuntimeStorage {
  readonly description: string
  private container?: ContainerClient
  private readonly blobName: string

  constructor(private readonly config: AzureBlobStorageConfig) {
    this.blobName = config.blobName
    this.description = `Azure Blob Storage (container "${config.container}", blob "${config.blobName}")`
  }

  private async containerClient(): Promise<ContainerClient> {
    if (!this.container) {
      const service = BlobServiceClient.fromConnectionString(this.config.connectionString)
      this.container = service.getContainerClient(this.config.container)
      await this.container.createIfNotExists()
    }
    return this.container
  }

  async load(): Promise<DecisionRecord[]> {
    const container = await this.containerClient()
    try {
      const buffer = await container.getBlockBlobClient(this.blobName).downloadToBuffer()
      return JSON.parse(buffer.toString('utf-8')) as DecisionRecord[]
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) return []
      throw err
    }
  }

  async save(records: DecisionRecord[]): Promise<void> {
    const container = await this.containerClient()
    const body = JSON.stringify(records, null, 2)
    await container.getBlockBlobClient(this.blobName).upload(body, Buffer.byteLength(body), {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    })
  }
}
