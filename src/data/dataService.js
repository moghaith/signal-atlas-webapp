/**
 * Signal Atlas - Data Service (Server-only)
 *
 * Preferred endpoints:
 *   GET /api/devices
 *   GET /api/readings/history?device_id=...
 *   GET /api/readings/locations
 *
 * Fallback endpoint variants (still server-side):
 *   GET /api/network-data/{device_id}?limit=...&offset=...
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://sa.agentraeg.com'
const API_KEY = import.meta.env.VITE_API_KEY || ''
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://lxsnfitbbbfbignmxsdk.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const apiHeaders = {
  'Content-Type': 'application/json',
  ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
}

const supabaseHeaders = {
  'Content-Type': 'application/json',
  ...(SUPABASE_ANON_KEY ? {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  } : {}),
}

async function apiCall(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...apiHeaders,
      ...(options.headers || {}),
    },
  })
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${response.statusText} (${endpoint})`)
  }
  return response.json()
}

async function supabaseCall(path, params = {}) {
  if (!SUPABASE_ANON_KEY) {
    throw new Error('Missing VITE_SUPABASE_ANON_KEY for Supabase mode')
  }

  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })

  const response = await fetch(url.toString(), { headers: supabaseHeaders })
  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${response.statusText}`)
  }
  return response.json()
}

async function tryEndpoints(endpoints) {
  let lastError = null
  for (const endpoint of endpoints) {
    try {
      return await apiCall(endpoint)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('All endpoint variants failed')
}

export async function getDevicesWithInfo() {
  return tryEndpoints(['/api/devices'])
}

export async function getSupabaseDevicesWithInfo() {
  const rows = await supabaseCall('device_readings', {
    select: 'source,timestamp',
    source: 'not.is.null',
    order: 'timestamp.desc',
    limit: 10000,
  })

  const byDevice = new Map()
  for (const row of rows || []) {
    const deviceId = row.source
    if (!deviceId) continue
    if (!byDevice.has(deviceId)) {
      byDevice.set(deviceId, {
        device_id: deviceId,
        reading_count: 0,
        last_reading: row.timestamp || null,
      })
    }
    const entry = byDevice.get(deviceId)
    entry.reading_count += 1
    if (!entry.last_reading && row.timestamp) entry.last_reading = row.timestamp
  }

  return Array.from(byDevice.values()).sort((a, b) => a.device_id.localeCompare(b.device_id))
}

export async function getDeviceReadings(deviceId, limit = 50) {
  const encoded = encodeURIComponent(deviceId)
  const result = await tryEndpoints([
    `/api/readings/history?device_id=${encoded}&limit=${limit}`,
    `/api/network-data/${encoded}?limit=${limit}&offset=0`,
  ])

  const rows = Array.isArray(result) ? result : []
  return rows
    .filter((row) => row?.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
}

export async function getSupabaseDeviceReadings(deviceId, limit = 50) {
  const select = 'source,timestamp,latitude,longitude,altitude,level,asu,rsrp,rssi,dbm,rsrq,network_type,operator,cell_id,physical_cell_id,tracking_area_code,country,city,created_at'
  const chunkSize = 1000
  const target = Math.max(1, Number(limit) || 50)
  let offset = 0
  const allRows = []

  while (allRows.length < target) {
    const remaining = target - allRows.length
    const batchLimit = Math.min(chunkSize, remaining)

    const chunk = await supabaseCall('device_readings', {
      select,
      source: `eq.${deviceId}`,
      order: 'timestamp.asc',
      limit: batchLimit,
      offset,
    })

    if (!Array.isArray(chunk) || chunk.length === 0) break
    allRows.push(...chunk)
    offset += chunk.length

    if (chunk.length < batchLimit) break
  }

  return allRows.map((row) => ({
    device_id: row.source,
    timestamp: row.timestamp,
    latitude: row.latitude,
    longitude: row.longitude,
    altitude: row.altitude,
    level: row.level,
    asu: row.asu,
    rsrp: row.rsrp,
    rssi: row.rssi,
    dbm: row.dbm,
    rsrq: row.rsrq,
    network_type: row.network_type,
    operator: row.operator,
    cell_id: row.cell_id,
    physical_cell_id: row.physical_cell_id,
    tracking_area_code: row.tracking_area_code,
    country: row.country,
    city: row.city,
    created_at: row.created_at,
  }))
}

export async function getDeviceLocations() {
  const locations = await tryEndpoints(['/api/readings/locations'])

  if (Array.isArray(locations) && locations.length > 0) {
    return locations.filter((loc) => loc.latitude != null && loc.longitude != null)
  }

  const devices = await getDevicesWithInfo()
  const latestRows = await Promise.all(
    devices.map(async (device) => {
      try {
        const history = await getDeviceReadings(device.device_id, 1)
        const latest = history[history.length - 1] || null
        if (!latest || latest.latitude == null || latest.longitude == null) return null
        return {
          device_id: device.device_id,
          latitude: latest.latitude,
          longitude: latest.longitude,
          rsrp: latest.rsrp,
          rsrq: latest.rsrq,
          level: latest.level,
          operator: latest.operator,
          network_type: latest.network_type,
          timestamp: latest.timestamp,
        }
      } catch {
        return null
      }
    })
  )

  return latestRows.filter(Boolean)
}

export async function getSupabaseDeviceLocations() {
  const rows = await supabaseCall('device_readings', {
    select: 'source,timestamp,latitude,longitude,rsrp,rsrq,level,operator,network_type',
    source: 'not.is.null',
    latitude: 'not.is.null',
    longitude: 'not.is.null',
    order: 'timestamp.desc',
    limit: 10000,
  })

  const latestByDevice = new Map()
  for (const row of rows || []) {
    if (!row.source || latestByDevice.has(row.source)) continue
    latestByDevice.set(row.source, {
      device_id: row.source,
      latitude: row.latitude,
      longitude: row.longitude,
      rsrp: row.rsrp,
      rsrq: row.rsrq,
      level: row.level,
      operator: row.operator,
      network_type: row.network_type,
      timestamp: row.timestamp,
    })
  }

  return Array.from(latestByDevice.values())
}

function buildMobileQuery(filters = {}) {
  const params = new URLSearchParams()
  const allowed = ['operator', 'network_type', 'period', 'source', 'lat', 'lon', 'radius_km']
  for (const key of allowed) {
    const value = filters[key]
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

export async function getMobileMap(filters = {}) {
  const data = await apiCall(`/api/mobile/map${buildMobileQuery(filters)}`)
  return data.points || []
}

export async function getMobileOverview(filters = {}) {
  return apiCall(`/api/mobile/overview${buildMobileQuery(filters)}`)
}

export async function getMobileOperators() {
  const data = await apiCall('/api/mobile/operators/unique')
  return data.operators || []
}

export async function getMobileTrends(filters = {}) {
  const data = await apiCall(`/api/mobile/trends${buildMobileQuery(filters)}`)
  return (data.points || []).map((point) => ({
    timestamp: point.timestamp,
    rsrp: point.mean_rsrp,
    rssi: null,
    rsrq: point.mean_rsrq,
    asu: null,
    level: null,
  }))
}

export async function createNetworkData(payload) {
  return apiCall('/api/network-data', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function createBatchNetworkData(readings) {
  return apiCall('/api/network-data/batch', {
    method: 'POST',
    body: JSON.stringify({ readings }),
  })
}

function calcStats(values) {
  const clean = values.filter((v) => v != null)
  if (clean.length === 0) return null
  const sorted = [...clean].sort((a, b) => a - b)
  const sum = clean.reduce((a, b) => a + b, 0)
  const mean = sum / clean.length
  const median = clean.length % 2 === 0
    ? (sorted[clean.length / 2 - 1] + sorted[clean.length / 2]) / 2
    : sorted[Math.floor(clean.length / 2)]
  const variance = clean.reduce((acc, v) => acc + (v - mean) ** 2, 0) / clean.length
  const std = Math.sqrt(variance)
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(mean * 100) / 100,
    median,
    std: Math.round(std * 100) / 100,
    count: clean.length,
  }
}

export function getReadingStats(readings) {
  if (!readings || readings.length === 0) return null
  return {
    rsrp: calcStats(readings.map((r) => r.rsrp)),
    rssi: calcStats(readings.map((r) => r.rssi)),
    rsrq: calcStats(readings.map((r) => r.rsrq)),
    asu: calcStats(readings.map((r) => r.asu)),
    level: calcStats(readings.map((r) => r.level)),
  }
}
