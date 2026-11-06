import { Router, Request, Response } from 'express';
import { telemetryQualityEngine, RawTelemetryInput, ProcessedTelemetry } from '../telemetry/qualityEngine';
import { getSupabase, isSupabaseConfigured, localStore } from '../db/supabaseClient';

export const telemetryRouter = Router();

// Store connected SSE clients for real-time telemetry pushes
const sseClients: Response[] = [];

export function broadcastTelemetry(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

// GET /api/telemetry/stream (Server-Sent Events)
telemetryRouter.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.push(res);

  // Send initial sensor states
  const initData = {
    sensors: telemetryQualityEngine.getSensors(),
    recentReadings: localStore.telemetry_readings.slice(0, 20),
    timestamp: new Date().toISOString()
  };
  res.write(`event: init\ndata: ${JSON.stringify(initData)}\n\n`);

  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// GET /api/telemetry/sensors
telemetryRouter.get('/sensors', (_req: Request, res: Response) => {
  const sensors = telemetryQualityEngine.getSensors();
  res.json({
    status: 'ok',
    sensors,
    total: sensors.length,
    quarantinedCount: sensors.filter(s => s.health_status === 'QUARANTINED').length
  });
});

// GET /api/telemetry/history/:sensorId
telemetryRouter.get('/history/:sensorId', (req: Request, res: Response) => {
  const { sensorId } = req.params;
  const history = telemetryQualityEngine.getHistory(sensorId);
  const sensor = telemetryQualityEngine.getSensor(sensorId);

  res.json({
    status: 'ok',
    sensorId,
    sensor,
    history,
    count: history.length
  });
});

// POST /api/telemetry/ingest (Constraint 1 Ingestion endpoint)
telemetryRouter.post('/ingest', async (req: Request, res: Response) => {
  try {
    const { sensor_id, raw_value, unit, observed_at, source_id } = req.body;

    if (!sensor_id || raw_value === undefined) {
      return res.status(400).json({ error: 'sensor_id and raw_value are required' });
    }

    const input: RawTelemetryInput = {
      sensor_id,
      raw_value: Number(raw_value),
      unit,
      observed_at: observed_at || new Date().toISOString(),
      source_id
    };

    // Execute Constraint 1 Engine Pipeline
    const processed: ProcessedTelemetry = telemetryQualityEngine.ingest(input);

    // Save reading to persistence
    if (isSupabaseConfigured()) {
      const supabase = getSupabase()!;
      await supabase.from('telemetry_readings').insert({
        sensor_id: processed.sensor_id,
        raw_value: processed.raw_value,
        smoothed_value: processed.smoothed_value,
        unit: processed.unit,
        observed_at: processed.observed_at,
        ingested_at: processed.ingested_at,
        transit_lag_ms: processed.transit_lag_ms,
        quality_score: processed.quality_score,
        validation_status: processed.validation_status,
        anomaly_flags: processed.anomaly_flags,
        confidence_interval: processed.confidence_interval,
        notes: processed.notes
      });
    }

    localStore.telemetry_readings.unshift(processed);
    if (localStore.telemetry_readings.length > 200) {
      localStore.telemetry_readings.pop();
    }

    // Broadcast live event to all connected dashboard browsers
    broadcastTelemetry('reading', processed);

    return res.status(200).json({
      status: 'ok',
      processed,
      isAnomaly: processed.anomaly_flags.length > 0,
      constraint1Handled: true
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Telemetry ingestion failed' });
  }
});

// POST /api/telemetry/fuse (Constraint 1 Multi-Sensor Fusion)
telemetryRouter.post('/fuse', (req: Request, res: Response) => {
  try {
    const { sensor_ids } = req.body;
    if (!Array.isArray(sensor_ids) || sensor_ids.length === 0) {
      return res.status(400).json({ error: 'sensor_ids array is required' });
    }

    const fusionResult = telemetryQualityEngine.fuseSensors(sensor_ids);
    res.json({
      status: 'ok',
      fusion: fusionResult,
      fusionMethod: 'INVERSE_VARIANCE_WEIGHTED_CONSENSUS'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/telemetry/simulate (Test injector for Constraint 1 scenarios)
telemetryRouter.post('/simulate', (req: Request, res: Response) => {
  const { scenario } = req.body;
  // Scenarios: 'spike', 'stuck', 'high_jitter', 'missing_gap', 'delayed_packet', 'conflicting_sensors'
  const now = new Date();
  const results: ProcessedTelemetry[] = [];

  switch (scenario) {
    case 'spike': {
      // Injects a sudden impossible 450 km/h radar speed spike
      const reading = telemetryQualityEngine.ingest({
        sensor_id: 'SENSOR_ARAKKONAM_SPEED_A',
        raw_value: 450.0,
        unit: 'km/h',
        observed_at: now.toISOString()
      });
      results.push(reading);
      break;
    }

    case 'stuck': {
      // Injects 5 consecutive identical values to trigger stuck sensor fault
      for (let i = 0; i < 5; i++) {
        const t = new Date(now.getTime() + i * 3000);
        const reading = telemetryQualityEngine.ingest({
          sensor_id: 'SENSOR_SALEM_SUBSTATION_P1',
          raw_value: 24.125,
          unit: 'kV',
          observed_at: t.toISOString()
        });
        results.push(reading);
      }
      break;
    }

    case 'high_jitter': {
      // Injects rapidly oscillating volatile values
      const base = 120;
      for (let i = 0; i < 6; i++) {
        const offset = i % 2 === 0 ? 80 : -75;
        const reading = telemetryQualityEngine.ingest({
          sensor_id: 'SENSOR_KATPADI_CROWD_1',
          raw_value: base + offset,
          unit: 'passengers',
          observed_at: new Date(now.getTime() + i * 2000).toISOString()
        });
        results.push(reading);
      }
      break;
    }

    case 'delayed_packet': {
      // Injects reading with 3.5 minutes historical delay
      const pastTime = new Date(now.getTime() - 210_000);
      const reading = telemetryQualityEngine.ingest({
        sensor_id: 'SENSOR_VEHICLE_V1_GPS',
        raw_value: 65.0,
        unit: 'km/h',
        observed_at: pastTime.toISOString()
      });
      results.push(reading);
      break;
    }

    case 'missing_gap': {
      // Injects reading after 45-second heartbeat silence (expected: 3s)
      const gapTime = new Date(now.getTime() + 45_000);
      const reading = telemetryQualityEngine.ingest({
        sensor_id: 'SENSOR_ARAKKONAM_AXLE_B',
        raw_value: 55.0,
        unit: 'km/h',
        observed_at: gapTime.toISOString()
      });
      results.push(reading);
      break;
    }

    case 'conflicting_sensors': {
      // Sensor 1 reports heavy crowd (380), Sensor 2 reports empty (12)
      const r1 = telemetryQualityEngine.ingest({
        sensor_id: 'SENSOR_KATPADI_CROWD_1',
        raw_value: 380,
        unit: 'passengers',
        observed_at: now.toISOString()
      });
      const r2 = telemetryQualityEngine.ingest({
        sensor_id: 'SENSOR_KATPADI_CROWD_2',
        raw_value: 20,
        unit: 'passengers',
        observed_at: now.toISOString()
      });
      results.push(r1, r2);
      break;
    }

    default: {
      // Nominal standard reading
      const reading = telemetryQualityEngine.ingest({
        sensor_id: 'SENSOR_ARAKKONAM_SPEED_A',
        raw_value: 72.4,
        unit: 'km/h',
        observed_at: now.toISOString()
      });
      results.push(reading);
    }
  }

  // Broadcast results
  for (const r of results) {
    localStore.telemetry_readings.unshift(r);
    broadcastTelemetry('reading', r);
  }

  return res.json({
    status: 'ok',
    scenario,
    injectedCount: results.length,
    results
  });
});
