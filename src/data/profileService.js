import { get, patch, del } from "../services/apiClient";

export async function getProfile(id) {
  return get(`/api/profile/${id}`, { auth: true });
}

export async function updateProfile(id, { username }) {
  return patch(`/api/profile/${id}`, { username }, { auth: true });
}

export async function getWalletDetails(profile_id) {
  return get(`/api/wallet/${profile_id}`, { auth: true });
}

export async function getWalletTransactions(profile_id, limit = 50) {
  return get(`/api/wallet/${profile_id}/transactions?limit=${limit}`, { auth: true });
}

export async function getUserSamplesCount(device_id) {
  return get(`/api/mobile/users_samples?device_id=${encodeURIComponent(device_id)}`, { auth: false });
}

export async function deleteUserSamples(device_id) {
  return del(`/api/mobile/users_samples?device_id=${encodeURIComponent(device_id)}`, { auth: false });
}
