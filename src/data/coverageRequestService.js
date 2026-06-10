import { get, post, patch, del } from "../services/apiClient";

export async function getCoverageRequests({ status, country, city, sort_by } = {}) {
  const params = new URLSearchParams();
  if (status)  params.set("status",  status);
  if (country) params.set("country", country);
  if (city)    params.set("city",    city);
  if (sort_by) params.set("sort_by", sort_by);
  const qs = params.toString();
  return get(`/coverage-requests${qs ? `?${qs}` : ""}`, { auth: false });
}

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
  return get(`/coverage-requests/nearby?${params.toString()}`, { auth: false });
}

export async function getCoverageRequest(requestId) {
  return get(`/coverage-requests/${requestId}`, { auth: false });
}

export async function getCoverageRequestProgress(requestId) {
  return get(`/coverage-requests/${requestId}/progress`, { auth: false });
}

export async function getCoverageRequestContributions(requestId) {
  return get(`/coverage-requests/${requestId}/contributions`, { auth: false });
}

export async function createCoverageRequest(payload) {
  return post("/coverage-requests", payload, { auth: true });
}

export async function updateCoverageRequest(requestId, payload) {
  return patch(`/coverage-requests/${requestId}`, payload, { auth: true });
}

export async function deleteCoverageRequest(requestId) {
  return del(`/coverage-requests/${requestId}`, { auth: true });
}

export async function getPolygonDensityScore(geojson) {
  return post("/coverage-requests/density-score", { area: geojson }, { auth: false });
}
