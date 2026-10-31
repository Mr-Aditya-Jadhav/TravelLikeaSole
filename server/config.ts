import { resolve } from 'node:path';

export const config = {
  port: Number(process.env.PORT || 5173),
  host: process.env.HOST || '127.0.0.1',
  apiKey: process.env.TINYFISH_API_KEY || '',
  dataDir: resolve(process.env.DATA_DIRECTORY || '.data'),
  publicUrl: process.env.PUBLIC_APP_URL || '',
  production: process.env.NODE_ENV === 'production',
  agentTimeoutSeconds: Math.max(
    60,
    Math.min(300, Number(process.env.AGENT_TIMEOUT_SECONDS || 180)),
  ),
  maxConcurrentJobs: Math.max(1, Math.min(4, Number(process.env.MAX_CONCURRENT_JOBS || 2))),
  monitoringEnabled: process.env.ENABLE_MONITORING !== 'false',
};
