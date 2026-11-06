import { Router, Request, Response } from 'express';
import { truthArbitrator, SourceRecordInput, ArbitrationResult } from '../conflicts/truthArbitrator';
import { getSupabase, isSupabaseConfigured, localStore } from '../db/supabaseClient';
import { broadcastTelemetry } from './telemetryRoutes';

export const conflictRouter = Router();

// GET /api/conflicts/ledger
conflictRouter.get('/ledger', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    totalConflicts: localStore.conflict_resolutions.length,
    quarantinedCount: localStore.conflict_resolutions.filter(c => c.resolution_status === 'CONFLICT_QUARANTINED').length,
    ledger: localStore.conflict_resolutions
  });
});

// POST /api/conflicts/arbitrate (Constraint 2 Arbitration Endpoint)
conflictRouter.post('/arbitrate', async (req: Request, res: Response) => {
  try {
    const { records, sensorWitnessState } = req.body;

    if (!Array.isArray(records) || records.length < 2) {
      return res.status(400).json({ error: 'At least two conflicting records are required for arbitration.' });
    }

    // Execute Constraint 2 Truth Arbitration Pipeline
    const result: ArbitrationResult = truthArbitrator.arbitrate(records as SourceRecordInput[], sensorWitnessState);

    // Save to persistence
    if (isSupabaseConfigured()) {
      const supabase = getSupabase()!;
      await supabase.from('conflict_resolutions').insert({
        entity_id: result.entity_id,
        entity_type: records[0].entity_type || 'corridor',
        attribute: result.attribute,
        competing_records: result.competing_records,
        winner_source: result.winner_source,
        winner_value: result.winner_value,
        resolution_status: result.resolution_status,
        decision_vectors: result.competing_records.map(c => ({
          source: c.record.source_name,
          factors: c.factors
        })),
        margin_of_victory: result.margin_of_victory,
        arbitration_rationale: result.rationale,
        arbitrated_at: result.arbitrated_at
      });
    }

    localStore.conflict_resolutions.unshift(result);
    if (localStore.conflict_resolutions.length > 100) {
      localStore.conflict_resolutions.pop();
    }

    // Broadcast conflict event to dashboard
    broadcastTelemetry('conflict_resolved', result);

    return res.status(200).json({
      status: 'ok',
      result,
      antiLwwEnforced: true,
      constraint2Handled: true
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Arbitration failure' });
  }
});

// POST /api/conflicts/simulate (Inject pre-configured Constraint 2 scenarios)
conflictRouter.post('/simulate', (req: Request, res: Response) => {
  const { scenario } = req.body;
  const now = new Date();

  let records: SourceRecordInput[] = [];
  let sensorWitnessState: any = undefined;

  switch (scenario) {
    case 'stale_new_arrival': {
      /**
       * SCENARIO 1: The Classic LWW Trap!
       * Record A: Station Dispatch reported 2 minutes ago: "Katpadi Stop is CLOSED due to emergency track defect". Arrived 90 seconds ago.
       * Record B: Old automated cache replay from 45 minutes ago: "Katpadi Stop is OPEN".
       * Arrived 2 SECONDS AGO across a delayed satellite buffer!
       * A naive LWW system would inspect arrival time (2s ago > 90s ago) and declare Katpadi OPEN!
       * Our Truth Arbitrator detects real-world staleness and rejects Record B.
       */
      const eventTimeA = new Date(now.getTime() - 120_000).toISOString(); // 2m ago
      const eventTimeB = new Date(now.getTime() - 2_700_000).toISOString(); // 45m ago (stale!)

      records = [
        {
          entity_id: 'CORRIDOR_KATPADI',
          entity_type: 'corridor',
          attribute: 'status',
          reported_value: { is_closed: true, reason: 'Track geometry defect' },
          source_name: 'Katpadi_Station_Dispatch',
          source_type: 'OPERATOR_DISPATCH',
          event_timestamp: eventTimeA,
          ingested_at: new Date(now.getTime() - 90_000).toISOString(), // arrived 90s ago
          sequence_number: 14
        },
        {
          entity_id: 'CORRIDOR_KATPADI',
          entity_type: 'corridor',
          attribute: 'status',
          reported_value: { is_closed: false, reason: 'Normal operations' },
          source_name: 'Regional_Schedule_Replay_Buffer',
          source_type: 'REGIONAL_FEED',
          event_timestamp: eventTimeB, // 45m old!
          ingested_at: new Date(now.getTime() - 2000).toISOString(), // arrived 2s ago! (NEWEST ARRIVAL)
          sequence_number: 8 // older causal epoch
        }
      ];
      break;
    }

    case 'witness_corroborated_blockade': {
      /**
       * SCENARIO 2: Physical Sensor Witness Arbitrates Disputed Status
       * Source A (Trackside SCADA): reports "Katpadi Track BLOCKED"
       * Source B (Passenger App Inquiry): reports "Track is CLEAR"
       * Witness radar speed sensor shows 0.0 km/h with obstacle trip flag!
       */
      const t = new Date(now.getTime() - 60_000).toISOString();
      records = [
        {
          entity_id: 'CORRIDOR_KATPADI',
          entity_type: 'corridor',
          attribute: 'status',
          reported_value: { is_closed: true, reason: 'Axle trip alarm' },
          source_name: 'Trackside_Interlocking_SCADA',
          source_type: 'HARDWARE_SCADA',
          event_timestamp: t,
          ingested_at: now.toISOString(),
          sequence_number: 22
        },
        {
          entity_id: 'CORRIDOR_KATPADI',
          entity_type: 'corridor',
          attribute: 'status',
          reported_value: { is_closed: false, reason: 'Unverified Passenger report' },
          source_name: 'Passenger_Social_Feed',
          source_type: 'PASSENGER_CROWDSOURCED',
          event_timestamp: t,
          ingested_at: now.toISOString(),
          sequence_number: 22
        }
      ];

      sensorWitnessState = {
        'SENSOR_ARAKKONAM_SPEED_A': { speed: 0.0, trip_flag: true },
        'SENSOR_ARAKKONAM_AXLE_B': { speed: 0.0, trip_flag: true }
      };
      break;
    }

    case 'close_call_quarantine': {
      /**
       * SCENARIO 3: Ambiguous Close Call triggering Quarantine Fail-Safe
       * Two sources with nearly identical trust and timestamps assert conflicting vehicle capacities.
       * Margin is within 5%, so system refuses to gamble and locks in conservative failsafe!
       */
      const t = new Date(now.getTime() - 30_000).toISOString();
      records = [
        {
          entity_id: 'VEHICLE_V1',
          entity_type: 'vehicle',
          attribute: 'capacity',
          reported_value: { seats: 40, accessible_spaces: 2 },
          source_name: 'Depot_Fleet_Manager_East',
          source_type: 'OPERATOR_DISPATCH',
          event_timestamp: t,
          ingested_at: now.toISOString(),
          source_reputation: 0.88,
          sequence_number: 10
        },
        {
          entity_id: 'VEHICLE_V1',
          entity_type: 'vehicle',
          attribute: 'capacity',
          reported_value: { seats: 28, accessible_spaces: 1 },
          source_name: 'Depot_Fleet_Manager_West',
          source_type: 'OPERATOR_DISPATCH',
          event_timestamp: t,
          ingested_at: now.toISOString(),
          source_reputation: 0.87,
          sequence_number: 10
        }
      ];
      break;
    }

    default: {
      return res.status(400).json({ error: 'Unknown scenario. Choose: stale_new_arrival, witness_corroborated_blockade, close_call_quarantine' });
    }
  }

  const result = truthArbitrator.arbitrate(records, sensorWitnessState);
  localStore.conflict_resolutions.unshift(result);
  broadcastTelemetry('conflict_resolved', result);

  return res.json({
    status: 'ok',
    scenario,
    result
  });
});
