export type ApiKind = 'Search' | 'Fetch' | 'Browser' | 'Agent' | 'Monitor';
export type Evidence = {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  retrievedAt: string;
  category: string;
  source: ApiKind;
  publishedAt?: string | null;
};
export type Candidate = {
  id: string;
  name: string;
  category: 'attraction' | 'food' | 'stay' | 'transport' | 'event';
  description: string;
  url: string;
  evidenceIds: string[];
  durationMinutes: number | null;
  walkingMinutes: number | null;
  stepFree: boolean | null;
  diets: string[];
  location: string | null;
  opensAt: string | null;
  closesAt: string | null;
  date: string | null;
  price: {
    amount: number | null;
    currency: string;
    unit: 'person' | 'room_night' | 'group' | 'unknown';
    status: 'observed_generic' | 'observed_for_dates' | 'unknown';
    taxesIncluded: boolean | null;
  };
  gaps: string[];
  source: ApiKind;
  coordinates?: { latitude: number; longitude: number } | null;
  ranking?: RecommendationRanking;
};
export type RecommendationRanking = {
  version: 'hybrid-v1';
  score: number;
  components: {
    interests: number;
    atmosphere: number;
    pace: number;
    evidence: number;
    freshness: number;
    budget: number;
  };
  matchedInterests: string[];
  reasons: string[];
  caveats: string[];
  diversityPenalty?: number;
  proximityBonus?: number;
};
export type ResearchEvent = {
  id: string;
  api: ApiKind | 'Planner';
  status: 'running' | 'complete' | 'partial' | 'failed';
  message: string;
  at: string;
  providerId?: string;
};
export type ResearchState = {
  jobId: string;
  status: 'queued' | 'researching' | 'validating' | 'ready' | 'partial' | 'failed' | 'cancelled';
  phase: string;
  events: ResearchEvent[];
  evidence: Evidence[];
  candidates: Candidate[];
  gaps: string[];
  updatedAt: string;
  destination?: { name: string; timezone: string | null };
  ranking?: { version: 'hybrid-v1'; method: string; beamWidth: number; rankedAt: string };
};
export type TripChange = {
  id: string;
  detectedAt: string;
  summary: string;
  sourceUrl: string;
  relevant: boolean | null;
  disposition: 'new' | 'dismissed';
  baseline?: boolean;
};
export type TripWatch = {
  id: string;
  tripId: string;
  status: 'active' | 'paused' | 'stopped' | 'failed' | 'creating';
  type: 'fetch' | 'search';
  target: string;
  frequency: 'daily' | 'six_hourly';
  expiresAt: string;
  createdAt: string;
  lastCheckedAt?: string;
  lastError?: string;
  delivery: 'webhook' | 'server';
  changes: TripChange[];
};
export type ServerStatus = {
  configured: boolean;
  mode: string;
  monitoringDelivery: 'webhook' | 'server';
  capabilities: string[];
};
