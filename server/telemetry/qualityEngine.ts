/**
 * ============================================================================
 * CONSTRAINT 1: UNRELIABLE TELEMETRY INGESTION & QUALITY ENGINE
 * ============================================================================
 * Handles:
 *  1. Missing readings (Heartbeat tracking & gap imputation)
 *  2. Sudden spikes (Modified Z-score / MAD outlier rejection)
 *  3. Repeated values (Zero-variance stuck-sensor detector)
 *  4. Unusual fluctuation (Adaptive EMA / Volatility filter)
 *  5. Delayed observation (Bi-temporal out-of-order reconciliation)
 *  6. Conflicted readings from different sensors (Fault-tolerant fusion)
 */

export interface SensorConfig {
  id: string;
  name: string;
  sensor_type: string;
  location: string;
  unit: string;
  nominal_min: number;
  nominal_max: number;
  max_rate_of_change: number; // max allowable change per second
  expected_interval_sec: number;
  health_status: 'HEALTHY' | 'DEGRADED' | 'QUARANTINED' | 'OFFLINE';
  consecutive_anomalies: number;
}

export interface RawTelemetryInput {
  sensor_id: string;
  raw_value: number;
  unit?: string;
  observed_at: string; // ISO string from sensor clock
  source_id?: string;
}

export type ValidationStatus = 
  | 'VALID'
  | 'SPIKE_REJECTED'
  | 'STUCK_SENSOR'
  | 'EXCESSIVE_VARIANCE'
  | 'DELAYED_RECONCILED'
  | 'FUSED_CONSENSUS'
  | 'QUARANTINED';

export interface ProcessedTelemetry {
  id: string;
  sensor_id: string;
  raw_value: number;
  smoothed_value: number;
  unit: string;
  observed_at: string;
  ingested_at: string;
  transit_lag_ms: number;
  quality_score: number; // 0.0 to 1.0
  validation_status: ValidationStatus;
  anomaly_flags: string[];
  confidence_interval: { lower: number; upper: number };
  notes: string;
}

export class TelemetryQualityEngine {
  private sensorConfigs: Map<string, SensorConfig> = new Map();
  // History of recent readings per sensor (up to 50 entries)
  private sensorHistory: Map<string, ProcessedTelemetry[]> = new Map();

  constructor() {
    this.initDefaultSensors();
  }

  private initDefaultSensors() {
    const defaults: SensorConfig[] = [
      {
        id: 'SENSOR_KATPADI_CROWD_1',
        name: 'Katpadi Platform 1 Optical Flow',
        sensor_type: 'station_crowd',
        location: 'Katpadi',
        unit: 'passengers',
        nominal_min: 0,
        nominal_max: 500,
        max_rate_of_change: 60,
        expected_interval_sec: 5,
        health_status: 'HEALTHY',
        consecutive_anomalies: 0,
      },
      {
        id: 'SENSOR_KATPADI_CROWD_2',
        name: 'Katpadi Turnstile IR Sensor',
        sensor_type: 'station_crowd',
        location: 'Katpadi',
        unit: 'passengers',
        nominal_min: 0,
        nominal_max: 500,
        max_rate_of_change: 60,
        expected_interval_sec: 5,
        health_status: 'HEALTHY',
        consecutive_anomalies: 0,
      },
      {
        id: 'SENSOR_ARAKKONAM_SPEED_A',
        name: 'Arakkonam Junction Doppler Radar',
        sensor_type: 'track_speed',
        location: 'Arakkonam',
        unit: 'km/h',
        nominal_min: 0,
        nominal_max: 140,
        max_rate_of_change: 30,
        expected_interval_sec: 3,
        health_status: 'HEALTHY',
        consecutive_anomalies: 0,
      },
      {
        id: 'SENSOR_ARAKKONAM_AXLE_B',
        name: 'Arakkonam Track Axle Counter',
        sensor_type: 'track_speed',
        location: 'Arakkonam',
        unit: 'km/h',
        nominal_min: 0,
        nominal_max: 140,
        max_rate_of_change: 30,
        expected_interval_sec: 3,
        health_status: 'HEALTHY',
        consecutive_anomalies: 0,
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
        consecutive_anomalies: 0,
      },
      {
        id: 'SENSOR_VEHICLE_V1_GPS',
        name: 'West Coast Relief Coach A Telemetry',
        sensor_type: 'vehicle_gps',
        location: 'Corridor-West',
        unit: 'km/h',
        nominal_min: 0,
        nominal_max: 100,
        max_rate_of_change: 25,
        expected_interval_sec: 2,
        health_status: 'HEALTHY',
        consecutive_anomalies: 0,
      },
    ];

    for (const c of defaults) {
      this.sensorConfigs.set(c.id, c);
      this.sensorHistory.set(c.id, []);
    }
  }

  public registerSensor(config: SensorConfig) {
    this.sensorConfigs.set(config.id, config);
    if (!this.sensorHistory.has(config.id)) {
      this.sensorHistory.set(config.id, []);
    }
  }

  public getSensors(): SensorConfig[] {
    return Array.from(this.sensorConfigs.values());
  }

  public getSensor(id: string): SensorConfig | undefined {
    return this.sensorConfigs.get(id);
  }

  public getHistory(sensorId: string): ProcessedTelemetry[] {
    return this.sensorHistory.get(sensorId) || [];
  }

  /**
   * INGESTION PIPELINE: Constraint 1 Multi-Stage Evaluation
   */
  public ingest(input: RawTelemetryInput): ProcessedTelemetry {
    const now = new Date();
    const ingestedAt = now.toISOString();
    const observedAtDate = new Date(input.observed_at);
    const transitLagMs = Math.max(0, now.getTime() - observedAtDate.getTime());

    let config = this.sensorConfigs.get(input.sensor_id);
    if (!config) {
      // Auto-register unknown sensor with safe defaults
      config = {
        id: input.sensor_id,
        name: `Dynamic Sensor ${input.sensor_id}`,
        sensor_type: 'track_speed',
        location: 'Corridor-General',
        unit: input.unit || 'units',
        nominal_min: 0,
        nominal_max: 500,
        max_rate_of_change: 50,
        expected_interval_sec: 5,
        health_status: 'HEALTHY',
        consecutive_anomalies: 0,
      };
      this.registerSensor(config);
    }

    const history = this.sensorHistory.get(input.sensor_id) || [];
    const anomalyFlags: string[] = [];
    let qualityScore = 1.0;
    let validationStatus: ValidationStatus = 'VALID';
    let smoothedValue = input.raw_value;
    const notes: string[] = [];

    // Stage 1: Delayed Observation & Out-of-Order Check
    const MAX_LAG_MS = 60_000; // 60 seconds allowable lag
    if (transitLagMs > MAX_LAG_MS) {
      anomalyFlags.push(`DELAYED_OBSERVATION_LAG_${Math.round(transitLagMs / 1000)}s`);
      qualityScore *= Math.max(0.2, Math.exp(-transitLagMs / 120_000));
      notes.push(`Packet delayed by ${(transitLagMs / 1000).toFixed(1)}s`);
      validationStatus = 'DELAYED_RECONCILED';
    }

    // Check if packet arrived out of temporal order compared to last observed
    if (history.length > 0) {
      const lastReading = history[0]; // most recent
      const lastObservedDate = new Date(lastReading.observed_at);
      if (observedAtDate.getTime() < lastObservedDate.getTime()) {
        anomalyFlags.push('OUT_OF_ORDER_RETROACTIVE');
        qualityScore *= 0.7;
        notes.push(`Retroactive timestamp older than current horizon by ${(lastObservedDate.getTime() - observedAtDate.getTime()) / 1000}s`);
      }
    }

    // Stage 2: Missing Readings & Heartbeat Gap Check
    if (history.length > 0) {
      const lastReading = history[0];
      const elapsedSec = (observedAtDate.getTime() - new Date(lastReading.observed_at).getTime()) / 1000;
      if (elapsedSec > config.expected_interval_sec * 2.0) {
        const missedPings = Math.round(elapsedSec / config.expected_interval_sec) - 1;
        anomalyFlags.push(`HEARTBEAT_GAP_MISSED_${missedPings}_READINGS`);
        qualityScore *= 0.85;
        notes.push(`Missing readings detected: gap of ${elapsedSec.toFixed(1)}s vs expected ${config.expected_interval_sec}s`);
      }
    }

    // Stage 3: Physical Boundary & Sudden Spike Check (Z-Score + MAD)
    if (input.raw_value < config.nominal_min || input.raw_value > config.nominal_max) {
      anomalyFlags.push('OUT_OF_PHYSICAL_BOUNDS');
      qualityScore *= 0.1;
      validationStatus = 'SPIKE_REJECTED';
      notes.push(`Raw ${input.raw_value} breaches nominal bounds [${config.nominal_min}, ${config.nominal_max}]`);
    }

    if (history.length >= 3) {
      const values = history.slice(0, 15).map(h => h.raw_value);
      const median = this.calculateMedian(values);
      const mad = this.calculateMAD(values, median);
      
      // Rate of change check
      const lastVal = history[0].raw_value;
      const lastTime = new Date(history[0].observed_at).getTime();
      const dtSec = Math.max(0.5, (observedAtDate.getTime() - lastTime) / 1000);
      const rateOfChange = Math.abs(input.raw_value - lastVal) / dtSec;

      if (rateOfChange > config.max_rate_of_change) {
        anomalyFlags.push('RATE_OF_CHANGE_EXCEEDED');
        qualityScore *= 0.3;
        if (validationStatus === 'VALID') validationStatus = 'SPIKE_REJECTED';
        notes.push(`Rate of change ${rateOfChange.toFixed(1)}/s exceeds max ${config.max_rate_of_change}/s`);
      }

      // Modified Z-Score: M_i = 0.6745 * |x - median| / MAD
      if (mad > 0.001) {
        const modZ = (0.6745 * Math.abs(input.raw_value - median)) / mad;
        if (modZ > 3.5) {
          anomalyFlags.push(`SUDDEN_SPIKE_Z_${modZ.toFixed(1)}`);
          qualityScore *= 0.15;
          validationStatus = 'SPIKE_REJECTED';
          notes.push(`Modified Z-score ${modZ.toFixed(2)} > 3.5 outlier threshold`);
        }
      }
    }

    // Stage 4: Stuck Sensor / Repeated Value Detection
    if (history.length >= 4) {
      const recent4 = history.slice(0, 4).map(h => h.raw_value);
      const allIdentical = recent4.every(v => Math.abs(v - input.raw_value) < 0.0001);
      // In dynamic physical environments, exactly 0 variance over 5 reads indicates stuck ADC/sensor
      if (allIdentical) {
        anomalyFlags.push('STUCK_SENSOR_CONSTANT_VALUE');
        qualityScore *= 0.25;
        validationStatus = 'STUCK_SENSOR';
        notes.push('Sensor stuck: identical value across 5 consecutive readings');
      }
    }

    // Stage 5: High Fluctuation / Volatility & Adaptive EMA Smoothing
    if (history.length >= 2) {
      const prevSmoothed = history[0].smoothed_value;
      const values = history.slice(0, 8).map(h => h.raw_value);
      const variance = this.calculateVariance(values);
      const baselineVariance = Math.pow((config.nominal_max - config.nominal_min) * 0.05, 2);

      if (variance > baselineVariance * 3) {
        anomalyFlags.push('UNUSUAL_FLUCTUATION_HIGH_JITTER');
        qualityScore *= 0.75;
        if (validationStatus === 'VALID') validationStatus = 'EXCESSIVE_VARIANCE';
        notes.push(`High jitter variance: ${variance.toFixed(2)}`);
      }

      // If spike rejected, substitute with EMA projection instead of corrupted raw spike
      if (validationStatus === 'SPIKE_REJECTED') {
        smoothedValue = prevSmoothed;
      } else {
        // Adaptive smoothing factor alpha: lower alpha when noisy, higher when confident
        const alpha = Math.min(0.6, Math.max(0.15, qualityScore * 0.5));
        smoothedValue = Number((alpha * input.raw_value + (1 - alpha) * prevSmoothed).toFixed(2));
      }
    } else {
      smoothedValue = input.raw_value;
    }

    // Update sensor health tracking
    if (anomalyFlags.length > 0) {
      config.consecutive_anomalies += 1;
      if (config.consecutive_anomalies >= 3) {
        config.health_status = 'DEGRADED';
      }
      if (config.consecutive_anomalies >= 6) {
        config.health_status = 'QUARANTINED';
        validationStatus = 'QUARANTINED';
        qualityScore = 0.0;
        notes.push('Sensor quarantined due to recurrent persistent telemetry failures');
      }
    } else {
      config.consecutive_anomalies = Math.max(0, config.consecutive_anomalies - 1);
      if (config.consecutive_anomalies === 0) {
        config.health_status = 'HEALTHY';
      }
    }

    // Confidence interval calculation
    const spread = (1 - qualityScore) * (config.nominal_max - config.nominal_min) * 0.2 + 1.0;
    const confidenceInterval = {
      lower: Number(Math.max(config.nominal_min, smoothedValue - spread).toFixed(2)),
      upper: Number(Math.min(config.nominal_max, smoothedValue + spread).toFixed(2)),
    };

    const processed: ProcessedTelemetry = {
      id: `tel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sensor_id: input.sensor_id,
      raw_value: input.raw_value,
      smoothed_value: smoothedValue,
      unit: input.unit || config.unit,
      observed_at: input.observed_at,
      ingested_at: ingestedAt,
      transit_lag_ms: transitLagMs,
      quality_score: Number(qualityScore.toFixed(3)),
      validation_status: validationStatus,
      anomaly_flags: anomalyFlags,
      confidence_interval: confidenceInterval,
      notes: notes.join('; ') || 'Telemetry nominal',
    };

    // Prepend to sensor history (keep last 50)
    history.unshift(processed);
    if (history.length > 50) {
      history.pop();
    }
    this.sensorHistory.set(input.sensor_id, history);

    return processed;
  }

  /**
   * Stage 6: Multi-Sensor Fault-Tolerant Fusion
   * Resolves conflicting readings from multiple sensors observing the same location/metric
   */
  public fuseSensors(sensorIds: string[]): {
    fused_value: number;
    consensus_confidence: number;
    discordant_sensors: string[];
    sensor_contributions: Array<{ sensor_id: string; weight: number; value: number }>;
  } {
    const validReadings: Array<{ id: string; value: number; quality: number; variance: number }> = [];

    for (const sid of sensorIds) {
      const history = this.sensorHistory.get(sid);
      if (!history || history.length === 0) continue;
      const latest = history[0];
      if (latest.validation_status === 'QUARANTINED') continue;

      const values = history.slice(0, 6).map(h => h.raw_value);
      const v = Math.max(0.5, this.calculateVariance(values));
      validReadings.push({
        id: sid,
        value: latest.smoothed_value,
        quality: latest.quality_score,
        variance: v,
      });
    }

    if (validReadings.length === 0) {
      return {
        fused_value: 0,
        consensus_confidence: 0,
        discordant_sensors: [],
        sensor_contributions: [],
      };
    }

    if (validReadings.length === 1) {
      return {
        fused_value: validReadings[0].value,
        consensus_confidence: validReadings[0].quality,
        discordant_sensors: [],
        sensor_contributions: [{ sensor_id: validReadings[0].id, weight: 1.0, value: validReadings[0].value }],
      };
    }

    // Step A: Calculate Median across all sensors to detect Byzantine discordant sensors
    const vals = validReadings.map(r => r.value);
    const medianVal = this.calculateMedian(vals);
    const mad = Math.max(1.0, this.calculateMAD(vals, medianVal));

    const nonDiscordant: typeof validReadings = [];
    const discordant: string[] = [];

    for (const r of validReadings) {
      const dev = Math.abs(r.value - medianVal);
      if (dev > mad * 3.0) {
        discordant.push(r.id);
      } else {
        nonDiscordant.push(r);
      }
    }

    const pool = nonDiscordant.length > 0 ? nonDiscordant : validReadings;

    // Step B: Inverse-Variance Weighting with Quality Modulation
    let totalWeight = 0;
    const weights: Array<{ sensor_id: string; weight: number; value: number }> = [];

    for (const r of pool) {
      // Weight = Quality / Variance
      const w = r.quality / r.variance;
      weights.push({ sensor_id: r.id, weight: w, value: r.value });
      totalWeight += w;
    }

    let fusedSum = 0;
    const normalizedContributions = weights.map(w => {
      const normW = totalWeight > 0 ? w.weight / totalWeight : 1 / pool.length;
      fusedSum += w.value * normW;
      return {
        sensor_id: w.sensor_id,
        weight: Number(normW.toFixed(3)),
        value: w.value,
      };
    });

    const avgConfidence = pool.reduce((acc, r) => acc + r.quality, 0) / pool.length;

    return {
      fused_value: Number(fusedSum.toFixed(2)),
      consensus_confidence: Number(avgConfidence.toFixed(3)),
      discordant_sensors: discordant,
      sensor_contributions: normalizedContributions,
    };
  }

  // --- Utility Statistics ---
  private calculateMedian(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private calculateMAD(numbers: number[], median: number): number {
    if (numbers.length === 0) return 0;
    const devs = numbers.map(x => Math.abs(x - median));
    return this.calculateMedian(devs);
  }

  private calculateVariance(numbers: number[]): number {
    if (numbers.length <= 1) return 1.0;
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const sumSquares = numbers.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0);
    return sumSquares / (numbers.length - 1);
  }
}

export const telemetryQualityEngine = new TelemetryQualityEngine();
