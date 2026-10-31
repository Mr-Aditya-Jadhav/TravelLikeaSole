import type { Trip, TripInput, TravelStyle } from './planner';
import type { ServerStatus, TripWatch } from './research';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 0, code = 'CONNECTION') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
let bootstrap: Promise<ServerStatus> | null = null;
async function request<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  if (path !== '/status') await getStatus();
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    throw new ApiError(
      'Could not reach the app server. Check your connection and try again. Your selections are still here.',
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      'The server returned an unreadable response. Please refresh the page.',
      response.status,
    );
  }
  if (!response.ok) {
    const error = payload as { error?: string; code?: string };
    throw new ApiError(
      error.error || 'The request could not be completed.',
      response.status,
      error.code,
    );
  }
  return payload as T;
}
function getStatus() {
  if (!bootstrap)
    bootstrap = request<ServerStatus>('/status').catch((error) => {
      bootstrap = null;
      throw error;
    });
  return bootstrap;
}
export const api = {
  status: getStatus,
  createTrip: async (input: TripInput, style: TravelStyle, requestId: string) =>
    (await request<{ trip: Trip }>('/trips', 'POST', { input, style, requestId })).trip,
  listTrips: async () => (await request<{ trips: Trip[] }>('/trips')).trips,
  getTrip: async (id: string) => (await request<{ trip: Trip }>(`/trips/${id}`)).trip,
  editTrip: async (id: string, data: Record<string, unknown>) =>
    (await request<{ trip: Trip }>(`/trips/${id}`, 'PATCH', data)).trip,
  deleteTrip: (id: string) => request(`/trips/${id}`, 'DELETE', {}),
  cancel: async (id: string) =>
    (await request<{ trip: Trip }>(`/trips/${id}/cancel`, 'POST', {})).trip,
  retry: async (id: string) =>
    (await request<{ trip: Trip }>(`/trips/${id}/research`, 'POST', {})).trip,
  watches: async (id: string) =>
    (await request<{ watches: TripWatch[] }>(`/trips/${id}/watches`)).watches,
  createWatch: async (id: string, data: Record<string, unknown>) =>
    (await request<{ watch: TripWatch }>(`/trips/${id}/watches`, 'POST', data)).watch,
  watchAction: async (id: string, action: string, data: Record<string, unknown> = {}) =>
    (await request<{ watch: TripWatch }>(`/watches/${id}/${action}`, 'POST', data)).watch,
};
