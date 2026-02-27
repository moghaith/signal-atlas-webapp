import Papa from 'papaparse'
import rawCsv from './device_readings.csv?raw'

const parsed = Papa.parse(rawCsv, {
  header: true,
  skipEmptyLines: true,
  dynamicTyping: true
})

export const allReadings = parsed.data

// get unique device IDs for the selector dropdown
export const deviceList = [...new Set(allReadings.map(row => row.device_id).filter(id => id))]


// Get all readings for one specific device
export function getDeviceReadings(deviceId) {
  return allReadings.filter(row => row.device_id === deviceId)
}

// Get the most recent reading for a device
export function getLatestReading(deviceId) {
  const readings = getDeviceReadings(deviceId)
  return readings.at(-1)
}