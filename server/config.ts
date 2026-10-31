import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

// Node's --env-file never overrides a variable that already exists in the shell. When the app is
// started with a project .env, prefer the key saved there, so a stale `export TINYFISH_API_KEY`
// in a shell profile cannot silently replace it. Runs without --env-file (tests) are unaffected.
function savedApiKey(): string {
  const index = process.execArgv.findIndex((arg) => arg.startsWith('--env-file'));
  if (index === -1) return '';
  const flag = process.execArgv[index];
  const file = flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : process.execArgv[index + 1];
  try {
    return parseEnv(readFileSync(resolve(file || '.env'), 'utf8')).TINYFISH_API_KEY?.trim() || '';
  } catch {
    return '';
  }
}
const fileKey = savedApiKey();
const shellKey = process.env.TINYFISH_API_KEY?.trim() || '';
if (fileKey && shellKey && fileKey !== shellKey)
  console.warn(
    'TinyFish: using TINYFISH_API_KEY from .env. A different value exported in your shell was ignored; remove that old export from your shell profile.',
  );

export const config = {
  port: Number(process.env.PORT || 5173),
  host: process.env.HOST || '127.0.0.1',
  apiKey: fileKey || shellKey,
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
