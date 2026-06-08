const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://sa.agentraeg.com'
const API_KEY = import.meta.env.VITE_API_KEY || "";

const apiHeaders = {
  "Content-Type": "application/json",
  ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
};
console.log("API_BASE_URL =", API_BASE_URL);
console.log("Login URL =", `${API_BASE_URL}/api/auth/login`);

async function profileApiCall(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: { ...apiHeaders, ...(options.headers || {}) },
  });
  if (!response.ok) {
    let detail = "";
    try { const b = await response.json(); detail = b?.detail || b?.message || ""; } catch {}
    throw new Error(`API ${response.status}: ${detail || response.statusText} (${endpoint})`);
  }
  return response.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
// When migrating to Supabase: replace login() with supabase.auth.signInWithPassword()
// and createAccount() with supabase.auth.signUp() + insert into profiles table

export async function login({ username, password }) {
  // NOTE: password is accepted here for future Supabase auth migration.
  // Current backend ignores it — swap this call for Supabase when ready.
  return profileApiCall("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function createAccount({ username, password, device_id }) {
  // NOTE: same as above — password placeholder for Supabase migration
  return profileApiCall("/api/account/create", {
    method: "POST",
    body: JSON.stringify({ username, password, device_id: device_id || null }),
  });
}

export async function getAccountByDevice(device_id) {
  return profileApiCall("/api/account/by-device", {
    method: "POST",
    body: JSON.stringify({ device_id }),
  });
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getProfile(id) {
  return profileApiCall(`/profile/${id}`);
}

export async function updateProfile(id, { username }) {
  return profileApiCall(`/api/profile/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ username }),
  });
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export async function getWalletDetails(profile_id) {
  return profileApiCall(`/api/wallet/${profile_id}`);
}

export async function getWalletTransactions(profile_id, limit = 50) {
  return profileApiCall(`/api/wallet/${profile_id}/transactions?limit=${limit}`);
}

// ─── Devices / Samples ────────────────────────────────────────────────────────

export async function getUserSamplesCount(device_id) {
  return profileApiCall(`/api/mobile/users_samples?device_id=${encodeURIComponent(device_id)}`);
}

export async function deleteUserSamples(device_id) {
  return profileApiCall(`/api/mobile/users_samples?device_id=${encodeURIComponent(device_id)}`, {
    method: "DELETE",
  });
}
