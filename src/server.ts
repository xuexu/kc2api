import 'dotenv/config'
import { loadConfig } from './config.js'
import { createApp } from './app.js'

const config = loadConfig()

if (!config.adminApiKey || config.adminApiKey === 'changeme') {
  console.warn('⚠  ADMIN_API_KEY is set to default "changeme". Change it in production.')
}

const app = createApp({
  adminApiKey: config.adminApiKey,
  publicApiKey: config.publicApiKey,
  requestTimeoutMs: config.requestTimeoutMs,
  logRawResponse: config.logRawResponse,
  modelListSource: config.modelListSource,
  dbPath: config.dbPath,
  kimchiUserAgent: config.kimchiUserAgent,
})

try {
  await app.listen({ port: config.port, host: config.host })
  console.log(`kimchi2api listening on http://${config.host}:${config.port}`)
  console.log(`admin: http://${config.host}:${config.port}/admin`)
  console.log(`playground: http://${config.host}:${config.port}/playground`)
  console.log(`db: ${config.dbPath}`)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
