import { config } from './config.ts';
import { AppError } from './security.ts';
import { z } from 'zod';

export const endpoints = {
  search: 'https://api.search.tinyfish.ai',
  fetch: 'https://api.fetch.tinyfish.ai',
  browser: 'https://api.browser.tinyfish.ai',
  agent: 'https://agent.tinyfish.ai/v1',
};
const errorMessage = (status: number) =>
  status === 401
    ? 'TinyFish rejected the API key. Check the server configuration.'
    : status === 402
      ? 'TinyFish wallet balance is too low. Add credits in the TinyFish dashboard.'
      : status === 403
        ? 'This TinyFish capability is not enabled for this API key.'
        : status === 429
          ? 'TinyFish is rate limiting requests. Please try again later.'
          : 'TinyFish could not complete this request. You can keep the available results.';

export class TinyFish {
  key: string;
  fetcher: typeof fetch;
  constructor(key = config.apiKey, fetcher = fetch) {
    this.key = key;
    this.fetcher = fetcher;
  }
  async request<T = Record<string, unknown>>(
    url: string,
    method = 'GET',
    data?: unknown,
    timeout = 60000,
  ): Promise<T> {
    if (!this.key)
      throw new AppError(
        503,
        'Configure TINYFISH_API_KEY on the server to enable live research.',
        'NOT_CONFIGURED',
      );
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method,
        headers: { 'X-API-Key': this.key, 'Content-Type': 'application/json' },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        signal: AbortSignal.timeout(timeout),
        redirect: 'error',
      });
    } catch {
      throw new AppError(
        502,
        'Could not reach TinyFish. A started automation may still be running; its saved run ID will be used to recover.',
        'PROVIDER_CONNECTION',
      );
    }
    if (!response.ok)
      throw new AppError(
        response.status >= 500 ? 502 : response.status,
        errorMessage(response.status),
        `TINYFISH_${response.status}`,
      );
    if (response.status === 204) return undefined as T;
    try {
      return (await response.json()) as T;
    } catch {
      throw new AppError(502, 'TinyFish returned an unreadable response.', 'PROVIDER_RESPONSE');
    }
  }
  async search(query: string) {
    const url = new URL(endpoints.search);
    url.searchParams.set('query', query);
    url.searchParams.set('language', 'en');
    const result = await this.request(url.href);
    return z
      .object({
        results: z.array(
          z.object({ title: z.string(), url: z.string(), snippet: z.string().default('') }),
        ),
      })
      .parse(result).results;
  }
  async fetchPages(urls: string[]) {
    const result = await this.request(
      endpoints.fetch,
      'POST',
      { urls: urls.slice(0, 10), format: 'markdown', ttl: 0 },
      90000,
    );
    return z
      .object({
        results: z
          .array(
            z.object({
              url: z.string(),
              final_url: z.string().optional(),
              title: z.string().nullable().optional(),
              text: z.string().default(''),
              published_date: z.string().nullable().optional(),
            }),
          )
          .default([]),
        errors: z.array(z.object({ url: z.string(), error: z.unknown().optional() })).default([]),
      })
      .parse(result);
  }
  async createBrowser(url?: string) {
    const raw = await this.request(
      endpoints.browser,
      'POST',
      { ...(url ? { url } : {}), timeout_seconds: 90 },
      90000,
    );
    return z
      .object({ session_id: z.string(), cdp_url: z.string(), base_url: z.string() })
      .parse(raw);
  }
  async closeBrowser(sessionId: string) {
    // Termination is idempotent. Retry termination, never ambiguous session creation.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.request(
          `${endpoints.browser}/${encodeURIComponent(sessionId)}`,
          'DELETE',
          undefined,
          20000,
        );
        return;
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  async startAgent(url: string, goal: string, outputSchema: unknown) {
    const raw = await this.request(
      `${endpoints.agent}/automation/run-async`,
      'POST',
      {
        url,
        goal,
        output_schema: outputSchema,
        browser_profile: 'lite',
        agent_config: { max_duration_seconds: config.agentTimeoutSeconds },
      },
      60000,
    );
    return z.object({ run_id: z.string() }).parse(raw).run_id;
  }
  async getRun(runId: string) {
    const raw = await this.request(
      `${endpoints.agent}/runs/${encodeURIComponent(runId)}?screenshots=none&html=none`,
    );
    return z
      .object({
        run_id: z.string(),
        status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']),
        result: z.unknown().optional(),
        error: z
          .object({ category: z.string().optional(), message: z.string().optional() })
          .nullable()
          .optional(),
      })
      .parse(raw);
  }
  cancelRun(runId: string) {
    return this.request(`${endpoints.agent}/runs/${encodeURIComponent(runId)}/cancel`, 'POST', {});
  }
  async createMonitor(data: unknown) {
    const raw = await this.request(`${endpoints.agent}/monitors`, 'POST', data, 90000);
    return z
      .object({
        monitor: z.object({ id: z.string(), status: z.string() }),
        run: z.record(z.string(), z.unknown()),
      })
      .parse(raw);
  }
  async monitorAction(id: string, action: 'pause' | 'resume' | 'stop' | 'run') {
    const url = `${endpoints.agent}/monitors/${encodeURIComponent(id)}`;
    if (action === 'run')
      return this.request<{ run: Record<string, unknown> }>(`${url}/runs`, 'POST', {}, 90000);
    return this.request(
      url,
      action === 'stop' ? 'DELETE' : 'PATCH',
      action === 'stop' ? undefined : { status: action === 'pause' ? 'paused' : 'active' },
    );
  }
  async getMonitor(id: string) {
    return this.request<{ status: string; last_error?: string | null }>(
      `${endpoints.agent}/monitors/${encodeURIComponent(id)}`,
    );
  }
}
export const tinyfish = new TinyFish();
