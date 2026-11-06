-- ====================================================================
-- THE STRANDED NETWORK: SUPABASE POSTGRESQL SCHEMA
-- Disruption Management, Unreliable Telemetry Filter & Truth Arbitration
-- ====================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------
-- 1. USERS & ROLES PROFILE TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('operator', 'dispatcher', 'auditor', 'passenger')),
    department TEXT DEFAULT 'Operations',
    avatar_color TEXT DEFAULT '#2563eb',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 2. SENSORS (Trackside, Vehicle GPS, Crowd Gates, Power)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sensors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sensor_type TEXT NOT NULL CHECK (sensor_type IN (
        'station_crowd', 'track_speed', 'headway_timer', 
        'vehicle_gps', 'gate_flow', 'power_substation'
    )),
    location TEXT NOT NULL,
    unit TEXT NOT NULL,
    nominal_min NUMERIC NOT NULL,
    nominal_max NUMERIC NOT NULL,
    max_rate_of_change NUMERIC NOT NULL,
    expected_interval_sec INTEGER NOT NULL DEFAULT 5,
    health_status TEXT NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'QUARANTINED', 'OFFLINE')
    ),
    consecutive_anomalies INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 3. TELEMETRY READINGS (Constraint 1: Raw Ingest & Validation)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telemetry_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sensor_id TEXT NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    raw_value NUMERIC NOT NULL,
    smoothed_value NUMERIC,
    unit TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ DEFAULT NOW(),
    transit_lag_ms INTEGER NOT NULL DEFAULT 0,
    quality_score NUMERIC NOT NULL CHECK (quality_score >= 0.0 AND quality_score <= 1.0),
    validation_status TEXT NOT NULL CHECK (validation_status IN (
        'VALID', 'SPIKE_REJECTED', 'STUCK_SENSOR', 
        'EXCESSIVE_VARIANCE', 'DELAYED_RECONCILED', 'FUSED_CONSENSUS', 'QUARANTINED'
    )),
    anomaly_flags JSONB DEFAULT '[]'::jsonb,
    confidence_interval JSONB,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_telemetry_sensor_observed 
    ON telemetry_readings(sensor_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_status 
    ON telemetry_readings(validation_status);

-- --------------------------------------------------------------------
-- 4. SOURCE RECORDS (Constraint 2: Multi-Source State Assertions)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS source_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id TEXT NOT NULL, -- e.g. 'CORRIDOR_KATPADI', 'VEHICLE_COACH_A'
    entity_type TEXT NOT NULL CHECK (entity_type IN ('corridor', 'vehicle', 'station', 'fleet_rule')),
    attribute TEXT NOT NULL, -- e.g. 'status', 'speed_limit', 'capacity'
    reported_value JSONB NOT NULL,
    source_name TEXT NOT NULL, -- e.g. 'Trackside_Interlocking_SCADA', 'Central_Dispatch'
    source_type TEXT NOT NULL CHECK (source_type IN (
        'HARDWARE_SCADA', 'OPERATOR_DISPATCH', 'REGIONAL_FEED', 
        'PASSENGER_CROWDSOURCED', 'THIRD_PARTY_API'
    )),
    source_reputation NUMERIC NOT NULL CHECK (source_reputation >= 0.0 AND source_reputation <= 1.0),
    event_timestamp TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ DEFAULT NOW(),
    transit_lag_sec NUMERIC NOT NULL,
    vector_clock JSONB DEFAULT '{}'::jsonb,
    sequence_number BIGINT NOT NULL DEFAULT 1,
    digital_signature TEXT
);

CREATE INDEX IF NOT EXISTS idx_source_records_entity 
    ON source_records(entity_id, attribute, ingested_at DESC);

-- --------------------------------------------------------------------
-- 5. CONFLICT RESOLUTIONS (Constraint 2: Non-Trivial Arbitration)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conflict_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    attribute TEXT NOT NULL,
    competing_records JSONB NOT NULL,
    winner_record_id UUID REFERENCES source_records(id),
    winner_source TEXT,
    winner_value JSONB,
    resolution_status TEXT NOT NULL CHECK (resolution_status IN (
        'RESOLVED', 'CONFLICT_QUARANTINED', 'ESCALATED_MANUAL', 'FAILSAFE_CONSERVATIVE'
    )),
    decision_vectors JSONB NOT NULL,
    margin_of_victory NUMERIC,
    arbitration_rationale TEXT NOT NULL,
    arbitrated_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_by TEXT NOT NULL DEFAULT 'SYSTEM_ARBITRATOR'
);

CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_entity 
    ON conflict_resolutions(entity_id, arbitrated_at DESC);

-- --------------------------------------------------------------------
-- 6. FLEET & CORRIDOR NETWORK ENTITIES
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    seats INTEGER NOT NULL,
    accessible_spaces INTEGER NOT NULL,
    origin TEXT NOT NULL,
    stops JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    delay_min INTEGER NOT NULL DEFAULT 0,
    current_stop TEXT,
    telemetry_health TEXT NOT NULL DEFAULT 'NOMINAL',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corridor_stops (
    stop_name TEXT PRIMARY KEY,
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    closure_reason TEXT,
    arbitrated_state TEXT DEFAULT 'VERIFIED_OPEN',
    verified_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parties (
    id TEXT PRIMARY KEY,
    origin TEXT NOT NULL,
    dest TEXT NOT NULL,
    size INTEGER NOT NULL,
    wheelchair BOOLEAN NOT NULL DEFAULT FALSE,
    vulnerable BOOLEAN NOT NULL DEFAULT FALSE,
    wait_min INTEGER NOT NULL DEFAULT 0,
    deadline INTEGER NOT NULL,
    confirmed BOOLEAN NOT NULL DEFAULT TRUE,
    computed_priority_score NUMERIC DEFAULT 0,
    placement_vehicle_id TEXT REFERENCES vehicles(id),
    placement_stop TEXT,
    status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN (
        'WAITING', 'PLACED', 'RESOLVED_ALTERNATIVE', 'QUARANTINED'
    )),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 7. AUDIT TRAIL LOG
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    details JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created 
    ON audit_log(created_at DESC);

-- --------------------------------------------------------------------
-- 8. INITIAL SEED DATA
-- --------------------------------------------------------------------
INSERT INTO users_profile (email, full_name, role, department) VALUES
('operator@stranded.net', 'Chief Dispatcher V. Raman', 'operator', 'Disruption Operations'),
('telemetry@stranded.net', 'Telemetry Lead Dr. S. Rao', 'dispatcher', 'Signal & Telemetry'),
('auditor@stranded.net', 'Safety Inspector M. Chen', 'auditor', 'Rail Safety Board'),
('passenger@stranded.net', 'P. Adhikary', 'passenger', 'Traveller Gateway')
ON CONFLICT (email) DO NOTHING;

INSERT INTO corridor_stops (stop_name, is_closed, closure_reason, arbitrated_state) VALUES
('Arakkonam', FALSE, NULL, 'VERIFIED_OPEN'),
('Katpadi', FALSE, NULL, 'VERIFIED_OPEN'),
('Vellore', FALSE, NULL, 'VERIFIED_OPEN'),
('Salem', FALSE, NULL, 'VERIFIED_OPEN'),
('Erode', FALSE, NULL, 'VERIFIED_OPEN'),
('Coimbatore', FALSE, NULL, 'VERIFIED_OPEN'),
('Madurai', FALSE, NULL, 'VERIFIED_OPEN')
ON CONFLICT (stop_name) DO NOTHING;

INSERT INTO sensors (id, name, sensor_type, location, unit, nominal_min, nominal_max, max_rate_of_change, expected_interval_sec, health_status) VALUES
('SENSOR_KATPADI_CROWD_1', 'Katpadi Platform 1 Optical Flow', 'station_crowd', 'Katpadi', 'passengers', 0, 500, 50, 5, 'HEALTHY'),
('SENSOR_KATPADI_CROWD_2', 'Katpadi Turnstile IR Sensor', 'station_crowd', 'Katpadi', 'passengers', 0, 500, 50, 5, 'HEALTHY'),
('SENSOR_ARAKKONAM_SPEED_A', 'Arakkonam Junction Doppler Radar', 'track_speed', 'Arakkonam', 'km/h', 0, 140, 25, 3, 'HEALTHY'),
('SENSOR_ARAKKONAM_AXLE_B', 'Arakkonam Track Axle Counter', 'track_speed', 'Arakkonam', 'km/h', 0, 140, 25, 3, 'HEALTHY'),
('SENSOR_SALEM_SUBSTATION_P1', 'Salem Traction Power SCADA', 'power_substation', 'Salem', 'kV', 22.0, 27.5, 3.0, 5, 'HEALTHY'),
('SENSOR_VEHICLE_V1_GPS', 'West Coast Relief Coach A Telemetry', 'vehicle_gps', 'Corridor-West', 'km/h', 0, 100, 20, 2, 'HEALTHY')
ON CONFLICT (id) DO NOTHING;
