/**
 * ============================================================================
 * CONSTRAINT 2: TRUTH ARBITRATION & STALE SOURCE CONFLICT RESOLUTION
 * ============================================================================
 * Prohibits simplistic Last-Write-Wins (LWW) or naive arrival-timestamp ordering.
 * Resolves conflicting records from purportedly reliable sources where at least
 * one record is stale, using multi-factor vector scoring, physical witness
 * corroboration, causal clocks, and fail-safe quarantine.
 */

export interface SourceRecordInput {
  entity_id: string; // e.g. 'CORRIDOR_KATPADI' or 'VEHICLE_COACH_A'
  entity_type: 'corridor' | 'vehicle' | 'station' | 'fleet_rule';
  attribute: string; // e.g. 'status', 'capacity', 'delay'
  reported_value: any; // e.g. 'BLOCKED', 'OPEN', { is_closed: true }
  source_name: string; // e.g. 'Trackside_Interlocking_SCADA'
  source_type: 'HARDWARE_SCADA' | 'OPERATOR_DISPATCH' | 'REGIONAL_FEED' | 'THIRD_PARTY_API' | 'PASSENGER_CROWDSOURCED';
  source_reputation?: number; // 0.0 to 1.0 (defaults by tier)
  event_timestamp: string; // ISO string when event occurred at physical origin
  ingested_at?: string; // ISO string when received by server (defaults to now)
  sequence_number?: number;
  vector_clock?: Record<string, number>;
  corroborating_witness_ids?: string[]; // IDs of sensors/sources backing this assertion
}

export interface FactorBreakdown {
  staleness_decay: number; // 0.0 to 1.0 (1.0 = ultra fresh)
  source_trust: number; // 0.0 to 1.0
  corroboration_score: number; // 0.0 to 1.0
  causal_validity: number; // 0.0 to 1.0
  transit_lag_penalty: number; // penalty subtracted
  total_composite_score: number; // Final weighted vector score
}

export interface ArbitrationResult {
  conflict_id: string;
  entity_id: string;
  attribute: string;
  resolution_status: 'RESOLVED' | 'CONFLICT_QUARANTINED' | 'ESCALATED_MANUAL' | 'FAILSAFE_CONSERVATIVE';
  winner_source: string | null;
  winner_value: any;
  winner_record: SourceRecordInput | null;
  competing_records: Array<{
    record: SourceRecordInput;
    factors: FactorBreakdown;
    is_stale: boolean;
    arrival_rank: number; // 1 = arrived newest
    event_age_seconds: number;
    transit_lag_seconds: number;
  }>;
  margin_of_victory: number;
  rationale: string;
  arbitrated_at: string;
  conservative_action_applied: string | null;
}

export class TruthArbitrator {
  // Configurable decay constants
  private stalenessHalfLifeSec: number = 300; // 5 minutes half-life
  private confidenceMarginThreshold: number = 0.15; // Require 15% clear margin to auto-resolve

  // Default authority tiers
  private readonly defaultTrustByTier: Record<string, number> = {
    HARDWARE_SCADA: 0.95,
    OPERATOR_DISPATCH: 0.90,
    REGIONAL_FEED: 0.75,
    THIRD_PARTY_API: 0.65,
    PASSENGER_CROWDSOURCED: 0.50,
  };

  constructor(halfLifeSec?: number, marginThreshold?: number) {
    if (halfLifeSec) this.stalenessHalfLifeSec = halfLifeSec;
    if (marginThreshold) this.confidenceMarginThreshold = marginThreshold;
  }

  /**
   * ARBITRATE: Compares 2 or more conflicting records without naive LWW
   */
  public arbitrate(
    records: SourceRecordInput[],
    sensorWitnessState?: Record<string, { speed?: number; crowd?: number; trip_flag?: boolean }>
  ): ArbitrationResult {
    const now = new Date();
    const arbitratedAt = now.toISOString();

    if (records.length === 0) {
      throw new Error('Arbitration requires at least one record.');
    }

    const entityId = records[0].entity_id;
    const attribute = records[0].attribute;

    // Stamp ingestion time if missing
    const preparedRecords = records.map(r => ({
      ...r,
      ingested_at: r.ingested_at || arbitratedAt,
      source_reputation: r.source_reputation ?? this.defaultTrustByTier[r.source_type] ?? 0.7,
      sequence_number: r.sequence_number ?? 1,
    }));

    // Rank by ingestion arrival order (1 = newest arrival) to explicitly audit why LWW is bypassed
    const sortedByArrival = [...preparedRecords].sort(
      (a, b) => new Date(b.ingested_at!).getTime() - new Date(a.ingested_at!).getTime()
    );

    // Evaluate each candidate
    const evaluations = preparedRecords.map(record => {
      const eventTime = new Date(record.event_timestamp).getTime();
      const ingestTime = new Date(record.ingested_at!).getTime();
      const nowTime = now.getTime();

      const eventAgeSec = Math.max(0, (nowTime - eventTime) / 1000);
      const transitLagSec = Math.max(0, (ingestTime - eventTime) / 1000);
      const arrivalRank = sortedByArrival.findIndex(r => r === record) + 1;

      // Factor 1: Physical Staleness Decay S_t = 2^(-age / half_life)
      const stalenessDecay = Math.pow(2, -eventAgeSec / this.stalenessHalfLifeSec);
      const isStale = eventAgeSec > this.stalenessHalfLifeSec * 1.5 || transitLagSec > 180;

      // Factor 2: Source Trust Score T_s
      const sourceTrust = record.source_reputation!;

      // Factor 3: Corroborating Witness Evidence C_w
      let corroborationScore = 0.5; // neutral baseline
      if (sensorWitnessState) {
        corroborationScore = this.evaluateWitnessCorroboration(record, sensorWitnessState);
      }

      // Factor 4: Causal Sequence Validity V_causal
      // Check sequence relative to peers
      let causalValidity = 0.8;
      const maxSeq = Math.max(...preparedRecords.map(p => p.sequence_number || 1));
      if (record.sequence_number && record.sequence_number < maxSeq) {
        causalValidity = 0.3; // older causal epoch
      } else if (record.sequence_number && record.sequence_number === maxSeq) {
        causalValidity = 1.0;
      }

      // Factor 5: Transit Lag Penalty (packets stuck in transit buffer)
      let transitPenalty = 0;
      if (transitLagSec > 60) {
        transitPenalty = Math.min(0.25, (transitLagSec - 60) / 600);
      }

      // Multi-Factor Composite Vector Calculation
      // W = 0.35 * Staleness + 0.25 * Trust + 0.30 * Corroboration + 0.10 * Causal - TransitPenalty
      const compositeScore = Math.max(
        0,
        Number(
          (
            0.35 * stalenessDecay +
            0.25 * sourceTrust +
            0.30 * corroborationScore +
            0.10 * causalValidity -
            transitPenalty
          ).toFixed(4)
        )
      );

      return {
        record,
        factors: {
          staleness_decay: Number(stalenessDecay.toFixed(4)),
          source_trust: Number(sourceTrust.toFixed(4)),
          corroboration_score: Number(corroborationScore.toFixed(4)),
          causal_validity: Number(causalValidity.toFixed(4)),
          transit_lag_penalty: Number(transitPenalty.toFixed(4)),
          total_composite_score: compositeScore,
        },
        is_stale: isStale,
        arrival_rank: arrivalRank,
        event_age_seconds: Number(eventAgeSec.toFixed(1)),
        transit_lag_seconds: Number(transitLagSec.toFixed(1)),
      };
    });

    // Sort by composite score descending
    evaluations.sort((a, b) => b.factors.total_composite_score - a.factors.total_composite_score);

    const leader = evaluations[0];
    const runnerUp = evaluations.length > 1 ? evaluations[1] : null;
    const margin = runnerUp ? leader.factors.total_composite_score - runnerUp.factors.total_composite_score : 1.0;

    const newestArrival = evaluations.find(e => e.arrival_rank === 1)!;
    const isAntiLWWTriggered = newestArrival.record !== leader.record;

    // Decision Logic
    let status: 'RESOLVED' | 'CONFLICT_QUARANTINED' | 'FAILSAFE_CONSERVATIVE';
    let winnerSource: string | null = null;
    let winnerValue: any = null;
    let winnerRecord: SourceRecordInput | null = null;
    let conservativeAction: string | null = null;
    const rationaleParts: string[] = [];

    if (runnerUp && margin < this.confidenceMarginThreshold) {
      // AMBIGUITY: Difference between top two is within dangerous error margin
      status = 'CONFLICT_QUARANTINED';
      winnerSource = null;
      winnerValue = null;
      winnerRecord = null;
      conservativeAction = this.deriveConservativeFailsafe(attribute, preparedRecords);

      rationaleParts.push(
        `[AMBIGUOUS CONFLICT] Confidence delta of ${(margin * 100).toFixed(1)}% is below safety threshold (${(this.confidenceMarginThreshold * 100).toFixed(1)}%). ` +
        `System refused to guess silently. Entity quarantined into fail-safe mode: ${conservativeAction}.`
      );
    } else {
      // Clear winner based on multi-factor truth vector
      status = 'RESOLVED';
      winnerSource = leader.record.source_name;
      winnerValue = leader.record.reported_value;
      winnerRecord = leader.record;

      if (isAntiLWWTriggered) {
        rationaleParts.push(
          `[ANTI-LWW ENFORCED] Bypassed newest arriving packet from '${newestArrival.record.source_name}' ` +
          `(lag: ${newestArrival.transit_lag_seconds}s, stale age: ${newestArrival.event_age_seconds}s). ` +
          `Selected authoritative source '${leader.record.source_name}' (Composite Truth: ${(leader.factors.total_composite_score * 100).toFixed(1)}% vs ${(newestArrival.factors.total_composite_score * 100).toFixed(1)}%).`
        );
      } else {
        rationaleParts.push(
          `Authoritative resolution confirmed for '${leader.record.source_name}' ` +
          `(Composite Truth: ${(leader.factors.total_composite_score * 100).toFixed(1)}%, victory margin: +${(margin * 100).toFixed(1)}%).`
        );
      }
    }

    return {
      conflict_id: `conf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      entity_id: entityId,
      attribute: attribute,
      resolution_status: status,
      winner_source: winnerSource,
      winner_value: winnerValue,
      winner_record: winnerRecord,
      competing_records: evaluations,
      margin_of_victory: Number(margin.toFixed(4)),
      rationale: rationaleParts.join(' '),
      arbitrated_at: arbitratedAt,
      conservative_action_applied: conservativeAction,
    };
  }

  /**
   * Helper to evaluate semantic meaning of claims
   */
  private isClaimingBlocked(val: any): boolean {
    if (val === null || val === undefined) return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const s = val.toLowerCase();
      return s === 'blocked' || s === 'closed' || s === 'danger' || s === 'halted';
    }
    if (typeof val === 'object') {
      if (val.is_closed === true || val.closed === true || val.status === 'BLOCKED' || val.status === 'CLOSED') {
        return true;
      }
      if (typeof val.reason === 'string') {
        const r = val.reason.toLowerCase();
        if (r.includes('defect') || r.includes('breach') || r.includes('trip') || r.includes('derailment') || r.includes('defect')) {
          return true;
        }
      }
    }
    return false;
  }

  private isClaimingOpen(val: any): boolean {
    if (val === null || val === undefined) return false;
    if (typeof val === 'boolean') return !val;
    if (typeof val === 'string') {
      const s = val.toLowerCase();
      return s === 'open' || s === 'clear' || s === 'normal';
    }
    if (typeof val === 'object') {
      if (val.is_closed === false || val.closed === false || val.status === 'OPEN' || val.status === 'CLEAR') {
        return true;
      }
    }
    return false;
  }

  /**
   * Cross-references independent physical sensor telemetry against claims
   */
  private evaluateWitnessCorroboration(
    record: SourceRecordInput,
    witnessState: Record<string, { speed?: number; crowd?: number; trip_flag?: boolean }>
  ): number {
    const claimsBlocked = this.isClaimingBlocked(record.reported_value);
    const claimsOpen = this.isClaimingOpen(record.reported_value);

    // Check Track / Corridor claims
    if (record.entity_id.toLowerCase().includes('katpadi') || record.entity_id.toLowerCase().includes('corridor')) {
      const radar = witnessState['SENSOR_ARAKKONAM_SPEED_A'];
      const axle = witnessState['SENSOR_ARAKKONAM_AXLE_B'];

      if (claimsBlocked) {
        // If speed is zero or trip flag active, physical telemetry confirms blockade!
        if ((radar?.speed !== undefined && radar.speed < 5) || (axle?.speed !== undefined && axle.speed < 5) || radar?.trip_flag || axle?.trip_flag) {
          return 0.95; // Strong physical corroboration
        }
      }

      if (claimsOpen) {
        // If speed is zero, physical reality refutes claim that corridor is open
        if ((radar?.speed !== undefined && radar.speed < 5) || radar?.trip_flag || axle?.trip_flag) {
          return 0.15; // Physics refutes claim!
        }
        if (radar?.speed !== undefined && radar.speed > 30) {
          return 0.90; // Vehicles moving, corroborates open
        }
      }
    }

    return 0.5; // neutral when no specific sensor witness available
  }

  /**
   * Derive conservative safety fallback when conflict is quarantined
   */
  private deriveConservativeFailsafe(attribute: string, records: SourceRecordInput[]): string {
    const anyBlocked = records.some(r => this.isClaimingBlocked(r.reported_value));
    
    if (attribute === 'status' || attribute === 'closure') {
      // Conservative rail policy: If anyone claims BLOCKED / DANGER, default to CLOSED until cleared
      if (anyBlocked) {
        return 'TREAT_CORRIDOR_CLOSED_HOLD_DISPATCH';
      }
    }

    if (attribute === 'capacity') {
      // Conservative policy: Default to lowest reported capacity to prevent stranded overflow
      return 'CLAMP_TO_MINIMUM_CAPACITY';
    }

    return 'HOLD_CURRENT_STATE_ALERT_DISPATCHER';
  }
}

export const truthArbitrator = new TruthArbitrator();
