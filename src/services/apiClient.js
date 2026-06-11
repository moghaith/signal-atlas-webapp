const API_BASE_URL = 'https://sa.agentraeg.com'
const API_KEY = 'ohnTcHS0nmGfk9pn6obclZpysjK8-y3O8zJn8S3xbqk'

const TOKEN_KEY = 'signal_atlas_access_token'
const REFRESH_TOKEN_KEY = 'signal_atlas_refresh_token'

let _refreshPromise = null

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function storeTokens(accessToken, refreshToken) {
  if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken)
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

async function refreshAccessToken() {
  const refreshToken = getStoredRefreshToken()
  if (!refreshToken) return null

  if (_refreshPromise) return _refreshPromise

  _refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!response.ok) {
        clearTokens()
        return null
      }
      const data = await response.json()
      storeTokens(data.access_token, data.refresh_token)
      return data.access_token
    } catch {
      clearTokens()
      return null
    } finally {
      _refreshPromise = null
    }
  })()

  return _refreshPromise
}

async function request(endpoint, options = {}) {
  const { body, method = 'GET', auth = true, headers: extraHeaders = {} } = options

  const headers = {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
    ...extraHeaders,
  }

  if (auth) {
    const token = getStoredToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  const fetchOptions = {
    method,
    headers,
  }
  if (body) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  let response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions)

  if (response.status === 401 && auth) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions)
    }
  }

  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = body?.detail || body?.message || ''
    } catch {}
    throw new Error(detail || `${response.status} ${response.statusText}`)
  }

  if (response.status === 204) return null
  return response.json()
}

export function get(endpoint, options = {}) {
  return request(endpoint, { ...options, method: 'GET' })
}

export function post(endpoint, body, options = {}) {
  return request(endpoint, { ...options, method: 'POST', body })
}

export function patch(endpoint, body, options = {}) {
  return request(endpoint, { ...options, method: 'PATCH', body })
}

export function del(endpoint, options = {}) {
  return request(endpoint, { ...options, method: 'DELETE' })
}

export default { get, post, patch, del, storeTokens, clearTokens, getStoredToken }
