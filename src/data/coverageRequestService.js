const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://sa.agentraeg.com'
const API_KEY = import.meta.env.VITE_API_KEY || ''
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://lxsnfitbbbfbignmxsdk.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''


const apiHeaders = {
  "Content-Type": "application/json",
  ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
};

async function coverageApiCall(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...apiHeaders,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.detail || body?.message || "";
    } catch {
      /* ignore */
    }
    throw new Error(
      `API ${response.status}: ${detail || response.statusText} (${endpoint})`
    );
  }
  return response.json();
}

// ─── GET /coverage-requests ───────────────────────────────────────────────────
// Params: status, country, city, sort_by (all optional)

export async function getCoverageRequests({ status, country, city, sort_by } = {}) {
  const params = new URLSearchParams();
  if (status)  params.set("status",  status);
  if (country) params.set("country", country);
  if (city)    params.set("city",    city);
  if (sort_by) params.set("sort_by", sort_by);
  const qs = params.toString();
  return coverageApiCall(`/coverage-requests${qs ? `?${qs}` : ""}`);
}

// ─── GET /coverage-requests/nearby ───────────────────────────────────────────
// Required: latitude, longitude
// Optional: radius_km, status, country, city

export async function getNearbyCoverageRequests({
  latitude,
  longitude,
  radius_km = 5,
  status = "OPEN",
  country,
  city,
} = {}) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    radius_km: String(radius_km),
  });
  if (status)  params.set("status",  status);
  if (country) params.set("country", country);
  if (city)    params.set("city",    city);
  return coverageApiCall(`/coverage-requests/nearby?${params.toString()}`);
}

// ─── GET /coverage-requests/:id ──────────────────────────────────────────────

export async function getCoverageRequest(requestId) {
  return coverageApiCall(`/coverage-requests/${requestId}`);
}

// ─── GET /coverage-requests/:id/progress ─────────────────────────────────────

export async function getCoverageRequestProgress(requestId) {
  return coverageApiCall(`/coverage-requests/${requestId}/progress`);
}

// ─── GET /coverage-requests/:id/contributions ────────────────────────────────

export async function getCoverageRequestContributions(requestId) {
  return coverageApiCall(`/coverage-requests/${requestId}/contributions`);
}

// ─── POST /coverage-requests ─────────────────────────────────────────────────
// payload shape matches CreateCoverageRequest schema:
// {
//   title, description?, created_by,
//   country?, city?,
//   area: { type: "Polygon", coordinates: [[[lng, lat], ...]] },
//   target_density_score, reward_amount
// }

export async function createCoverageRequest(payload) {
    console.log(`${API_BASE_URL}/coverage-requests`);
  return coverageApiCall("/coverage-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── PATCH /coverage-requests/:id ────────────────────────────────────────────
// payload: any subset of updatable fields (title, description, status, etc.)

export async function updateCoverageRequest(requestId, payload) {
  return coverageApiCall(`/coverage-requests/${requestId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}


export async function getPolygonDensityScore(geojson) {
  return coverageApiCall("/coverage-requests/density-score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ area: geojson }),
  });
}
