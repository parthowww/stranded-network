import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const isPlaceholder = 
  !SUPABASE_URL || 
  SUPABASE_URL.includes('placeholder-project') || 
  !SUPABASE_KEY || 
  SUPABASE_KEY.includes('placeholder-');

let realSupabase: SupabaseClient | null = null;

if (!isPlaceholder) {
  try {
    realSupabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('[Database] Connected to live Supabase instance at:', SUPABASE_URL);
  } catch (err) {
    console.warn('[Database] Failed to initialize Supabase client, falling back to local store:', err);
  }
} else {
  console.log('[Database] Running in Local Fallback mode (Supabase credentials not configured or placeholder). Full functionality active.');
}

// In-Memory Database store with Supabase table parity
export interface LocalStore {
  users_profile: any[];
  sensors: any[];
  telemetry_readings: any[];
  source_records: any[];
  conflict_resolutions: any[];
  vehicles: any[];
  parties: any[];
  corridor_stops: any[];
  audit_log: any[];
}

export const localStore: LocalStore = {
  users_profile: [
    {
      id: 'usr-1',
      email: 'operator@stranded.net',
      full_name: 'Chief Dispatcher V. Raman',
      role: 'operator',
      department: 'Disruption Operations',
      created_at: new Date().toISOString()
    },
    {
      id: 'usr-2',
      email: 'telemetry@stranded.net',
      full_name: 'Telemetry Lead Dr. S. Rao',
      role: 'dispatcher',
      department: 'Signal & Telemetry',
      created_at: new Date().toISOString()
    },
    {
      id: 'usr-3',
      email: 'auditor@stranded.net',
      full_name: 'Safety Inspector M. Chen',
      role: 'auditor',
      department: 'Rail Safety Board',
      created_at: new Date().toISOString()
    },
    {
      id: 'usr-4',
      email: 'passenger@stranded.net',
      full_name: 'P. Adhikary',
      role: 'passenger',
      department: 'Traveller Gateway',
      created_at: new Date().toISOString()
    }
  ],
  sensors: [
    {
      id: 'SENSOR_KATPADI_CROWD_1',
      name: 'Katpadi Platform 1 Optical Flow',
      sensor_type: 'station_crowd',
      location: 'Katpadi',
      unit: 'passengers',
      nominal_min: 0,
      nominal_max: 500,
      max_rate_of_change: 50,
      expected_interval_sec: 5,
      health_status: 'HEALTHY',
      consecutive_anomalies: 0
    },
    {
      id: 'SENSOR_KATPADI_CROWD_2',
      name: 'Katpadi Turnstile IR Sensor',
      sensor_type: 'station_crowd',
      location: 'Katpadi',
      unit: 'passengers',
      nominal_min: 0,
      nominal_max: 500,
      max_rate_of_change: 50,
      expected_interval_sec: 5,
      health_status: 'HEALTHY',
      consecutive_anomalies: 0
    },
    {
      id: 'SENSOR_ARAKKONAM_SPEED_A',
      name: 'Arakkonam Junction Doppler Radar',
      sensor_type: 'track_speed',
      location: 'Arakkonam',
      unit: 'km/h',
      nominal_min: 0,
      nominal_max: 140,
      max_rate_of_change: 25,
      expected_interval_sec: 3,
      health_status: 'HEALTHY',
      consecutive_anomalies: 0
    },
    {
      id: 'SENSOR_ARAKKONAM_AXLE_B',
      name: 'Arakkonam Track Axle Counter',
      sensor_type: 'track_speed',
      location: 'Arakkonam',
      unit: 'km/h',
      nominal_min: 0,
      nominal_max: 140,
      max_rate_of_change: 25,
      expected_interval_sec: 3,
      health_status: 'HEALTHY',
      consecutive_anomalies: 0
    },
    {
      id: 'SENSOR_SALEM_SUBSTATION_P1',
      name: 'Salem Traction Power SCADA',
      sensor_type: 'power_substation',
      location: 'Salem',
      unit: 'kV',
      nominal_min: 22.0,
      nominal_max: 27.5,
      max_rate_of_change: 3.0,
      expected_interval_sec: 5,
      health_status: 'HEALTHY',
      consecutive_anomalies: 0
    },
    {
      id: 'SENSOR_VEHICLE_V1_GPS',
      name: 'West Coast Relief Coach A Telemetry',
      sensor_type: 'vehicle_gps',
      location: 'Corridor-West',
      unit: 'km/h',
      nominal_min: 0,
      nominal_max: 100,
      max_rate_of_change: 20,
      expected_interval_sec: 2,
      health_status: 'HEALTHY',
      consecutive_anomalies: 0
    }
  ],
  telemetry_readings: [],
  source_records: [],
  conflict_resolutions: [],
  vehicles: [],
  parties: [],
  corridor_stops: [
    { stop_name: 'Arakkonam', is_closed: false, arbitrated_state: 'VERIFIED_OPEN' },
    { stop_name: 'Katpadi', is_closed: false, arbitrated_state: 'VERIFIED_OPEN' },
    { stop_name: 'Vellore', is_closed: false, arbitrated_state: 'VERIFIED_OPEN' },
    { stop_name: 'Salem', is_closed: false, arbitrated_state: 'VERIFIED_OPEN' },
    { stop_name: 'Erode', is_closed: false, arbitrated_state: 'VERIFIED_OPEN' },
    { stop_name: 'Coimbatore', is_closed: false, arbitrated_state: 'VERIFIED_OPEN' },
    { stop_name: 'Madurai', is_closed: false, arbitrated_state: 'VERIFIED_OPEN' }
  ],
  audit_log: []
};

export const isSupabaseConfigured = (): boolean => !isPlaceholder && realSupabase !== null;
export const getSupabase = (): SupabaseClient | null => realSupabase;
