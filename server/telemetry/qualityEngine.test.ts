import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryQualityEngine } from './qualityEngine';

describe('Constraint 1: Telemetry Quality Engine', () => {
  let engine: TelemetryQualityEngine;

  beforeEach(() => {
    engine = new TelemetryQualityEngine();
  });

  it('detects and rejects sudden spikes exceeding physical bounds or Modified Z-score', () => {
    const now = new Date();
    // Feed nominal readings first
    for (let i = 0; i < 5; i++) {
      engine.ingest({
        sensor_id: 'SENSOR_ARAKKONAM_SPEED_A',
        raw_value: 60 + i,
        observed_at: new Date(now.getTime() + i * 3000).toISOString()
      });
    }

    // Injected spike: 500 km/h (impossible on track)
    const spikeReading = engine.ingest({
      sensor_id: 'SENSOR_ARAKKONAM_SPEED_A',
      raw_value: 500,
      observed_at: new Date(now.getTime() + 18000).toISOString()
    });

    expect(spikeReading.validation_status).toBe('SPIKE_REJECTED');
    expect(spikeReading.quality_score).toBeLessThan(0.3);
    expect(spikeReading.anomaly_flags).toContain('OUT_OF_PHYSICAL_BOUNDS');
    // Smoothed value should discard the spike
    expect(spikeReading.smoothed_value).toBeLessThan(100);
  });

  it('detects stuck sensor with repeated constant values', () => {
    const now = new Date();
    let lastReading;
    // Feed 5 identical readings
    for (let i = 0; i < 5; i++) {
      lastReading = engine.ingest({
        sensor_id: 'SENSOR_SALEM_SUBSTATION_P1',
        raw_value: 25.000,
        observed_at: new Date(now.getTime() + i * 5000).toISOString()
      });
    }

    expect(lastReading?.validation_status).toBe('STUCK_SENSOR');
    expect(lastReading?.anomaly_flags).toContain('STUCK_SENSOR_CONSTANT_VALUE');
    expect(lastReading?.quality_score).toBeLessThan(0.4);
  });

  it('detects missing readings when heartbeat gap exceeds expected interval', () => {
    const now = new Date();
    engine.ingest({
      sensor_id: 'SENSOR_ARAKKONAM_AXLE_B',
      raw_value: 50,
      observed_at: now.toISOString()
    });

    // Send next reading after 30 seconds (expected is 3 seconds)
    const delayedReading = engine.ingest({
      sensor_id: 'SENSOR_ARAKKONAM_AXLE_B',
      raw_value: 52,
      observed_at: new Date(now.getTime() + 30_000).toISOString()
    });

    const hasGapFlag = delayedReading.anomaly_flags.some(f => f.startsWith('HEARTBEAT_GAP_MISSED'));
    expect(hasGapFlag).toBe(true);
  });

  it('detects delayed observation lag and flags out-of-order packets', () => {
    const now = new Date();
    // Event that happened 90 seconds ago
    const reading = engine.ingest({
      sensor_id: 'SENSOR_VEHICLE_V1_GPS',
      raw_value: 65,
      observed_at: new Date(now.getTime() - 90_000).toISOString()
    });

    expect(reading.transit_lag_ms).toBeGreaterThan(80_000);
    const hasDelayFlag = reading.anomaly_flags.some(f => f.startsWith('DELAYED_OBSERVATION_LAG'));
    expect(hasDelayFlag).toBe(true);
  });

  it('fuses conflicting sensors and isolates Byzantine discordant outlier', () => {
    const now = new Date();
    // Sensor 1 and Sensor 2 agree around ~150 passengers
    engine.ingest({
      sensor_id: 'SENSOR_KATPADI_CROWD_1',
      raw_value: 152,
      observed_at: now.toISOString()
    });
    engine.ingest({
      sensor_id: 'SENSOR_KATPADI_CROWD_2',
      raw_value: 148,
      observed_at: now.toISOString()
    });

    // Dynamic Sensor 3 reports wild outlier: 490
    engine.registerSensor({
      id: 'SENSOR_KATPADI_CROWD_3',
      name: 'Rogue Sensor 3',
      sensor_type: 'station_crowd',
      location: 'Katpadi',
      unit: 'passengers',
      nominal_min: 0,
      nominal_max: 500,
      max_rate_of_change: 60,
      expected_interval_sec: 5,
      health_status: 'HEALTHY',
      consecutive_anomalies: 0
    });
    engine.ingest({
      sensor_id: 'SENSOR_KATPADI_CROWD_3',
      raw_value: 490,
      observed_at: now.toISOString()
    });

    const fusion = engine.fuseSensors([
      'SENSOR_KATPADI_CROWD_1',
      'SENSOR_KATPADI_CROWD_2',
      'SENSOR_KATPADI_CROWD_3'
    ]);

    expect(fusion.discordant_sensors).toContain('SENSOR_KATPADI_CROWD_3');
    // Fused value should be around 150, unaffected by rogue 490
    expect(fusion.fused_value).toBeGreaterThan(140);
    expect(fusion.fused_value).toBeLessThan(160);
  });
});
