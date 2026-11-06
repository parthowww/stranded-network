import { describe, it, expect, beforeEach } from 'vitest';
import { TruthArbitrator, SourceRecordInput } from './truthArbitrator';

describe('Constraint 2: Truth Arbitration & Anti-LWW Engine', () => {
  let arbitrator: TruthArbitrator;

  beforeEach(() => {
    arbitrator = new TruthArbitrator();
  });

  it('rejects stale newly arriving record and enforces Anti-LWW', () => {
    const now = new Date();

    // Record A: Generated 2 minutes ago, arrived 90 seconds ago. Authoritative Dispatcher.
    const recordA: SourceRecordInput = {
      entity_id: 'CORRIDOR_KATPADI',
      entity_type: 'corridor',
      attribute: 'status',
      reported_value: { is_closed: true, reason: 'Track breach' },
      source_name: 'Central_Operator_Dispatch',
      source_type: 'OPERATOR_DISPATCH',
      event_timestamp: new Date(now.getTime() - 120_000).toISOString(), // 2m ago
      ingested_at: new Date(now.getTime() - 90_000).toISOString(),
      sequence_number: 14
    };

    // Record B: Generated 45 minutes ago (STALE), but arrived 1 SECOND AGO (NEWEST ARRIVAL)
    const recordB: SourceRecordInput = {
      entity_id: 'CORRIDOR_KATPADI',
      entity_type: 'corridor',
      attribute: 'status',
      reported_value: { is_closed: false, reason: 'Normal status' },
      source_name: 'Delayed_Regional_Replay_Buffer',
      source_type: 'REGIONAL_FEED',
      event_timestamp: new Date(now.getTime() - 2_700_000).toISOString(), // 45m old!
      ingested_at: new Date(now.getTime() - 1000).toISOString(), // arrived 1s ago!
      sequence_number: 5 // older sequence
    };

    const result = arbitrator.arbitrate([recordA, recordB]);

    // System MUST NOT treat newest arrival (Record B) as truth
    expect(result.winner_source).toBe('Central_Operator_Dispatch');
    expect(result.winner_value.is_closed).toBe(true);
    expect(result.resolution_status).toBe('RESOLVED');
    expect(result.rationale).toContain('ANTI-LWW ENFORCED');

    // Confirm Record B was flagged as stale
    const recordBEval = result.competing_records.find(r => r.record.source_name === 'Delayed_Regional_Replay_Buffer');
    expect(recordBEval?.is_stale).toBe(true);
    expect(recordBEval?.arrival_rank).toBe(1); // was indeed the newest arrival!
  });

  it('leverages physical sensor witnesses to resolve conflicting reports', () => {
    const now = new Date();
    const t = new Date(now.getTime() - 30_000).toISOString();

    const recordSCADA: SourceRecordInput = {
      entity_id: 'CORRIDOR_KATPADI',
      entity_type: 'corridor',
      attribute: 'status',
      reported_value: { is_closed: true, reason: 'Obstacle detector trip' },
      source_name: 'Trackside_Interlocking_SCADA',
      source_type: 'HARDWARE_SCADA',
      event_timestamp: t,
      ingested_at: now.toISOString(),
      sequence_number: 10
    };

    const recordPublic: SourceRecordInput = {
      entity_id: 'CORRIDOR_KATPADI',
      entity_type: 'corridor',
      attribute: 'status',
      reported_value: { is_closed: false, reason: 'Passenger report' },
      source_name: 'Passenger_Social_Feed',
      source_type: 'PASSENGER_CROWDSOURCED',
      event_timestamp: t,
      ingested_at: now.toISOString(),
      sequence_number: 10
    };

    // Track radar confirms speed is 0 km/h (vehicles halted)
    const witnessState = {
      'SENSOR_ARAKKONAM_SPEED_A': { speed: 0.0, trip_flag: true }
    };

    const result = arbitrator.arbitrate([recordSCADA, recordPublic], witnessState);

    expect(result.winner_source).toBe('Trackside_Interlocking_SCADA');
    expect(result.winner_value.is_closed).toBe(true);
  });

  it('triggers CONFLICT_QUARANTINED and failsafe when confidence margin is ambiguous', () => {
    const now = new Date();
    const t = new Date(now.getTime() - 10_000).toISOString();

    // Two sources of identical tier asserting different capacities at the exact same time
    const recordEast: SourceRecordInput = {
      entity_id: 'VEHICLE_V1',
      entity_type: 'vehicle',
      attribute: 'capacity',
      reported_value: { seats: 40 },
      source_name: 'Depot_A',
      source_type: 'OPERATOR_DISPATCH',
      source_reputation: 0.85,
      event_timestamp: t,
      ingested_at: now.toISOString(),
      sequence_number: 1
    };

    const recordWest: SourceRecordInput = {
      entity_id: 'VEHICLE_V1',
      entity_type: 'vehicle',
      attribute: 'capacity',
      reported_value: { seats: 30 },
      source_name: 'Depot_B',
      source_type: 'OPERATOR_DISPATCH',
      source_reputation: 0.85,
      event_timestamp: t,
      ingested_at: now.toISOString(),
      sequence_number: 1
    };

    const result = arbitrator.arbitrate([recordEast, recordWest]);

    // When margin is below safety threshold, system must quarantine and activate conservative failsafe
    expect(result.resolution_status).toBe('CONFLICT_QUARANTINED');
    expect(result.winner_source).toBeNull();
    expect(result.conservative_action_applied).toBe('CLAMP_TO_MINIMUM_CAPACITY');
    expect(result.rationale).toContain('AMBIGUOUS CONFLICT');
  });
});
