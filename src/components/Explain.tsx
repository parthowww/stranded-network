import React from 'react';
import type { Party, Placement, UnresolvedParty, Rule } from '../engine/types';
import { calculateScore, DEFAULT_RULES } from '../engine/score';

interface ExplainProps {
  party: Party;
  placement?: Placement;
  unresolvedInfo?: UnresolvedParty;
  rules: Rule[];
  onPlaceAlternative?: (partyId: string, vehicleId: string, stop?: string) => void;
}

export const Explain: React.FC<ExplainProps> = ({
  party,
  placement,
  unresolvedInfo,
  rules = DEFAULT_RULES,
  onPlaceAlternative,
}) => {
  const { score, breakdown } = calculateScore(party, rules);
  const isPlaced = placement !== undefined;

  return (
    <div className="explain-panel">
      <div className="explain-header">
        <span className="explain-score-large num">{score.toFixed(1)}</span>
        <div>
          <span className="explain-score-label">Priority score (out of 100)</span>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--mid-grey)', fontFamily: 'var(--font-mono)' }}>
            Wait: {party.waitMin}m · Deadline: T+{party.deadline}m · {party.size} {party.size === 1 ? 'seat' : 'seats'}
          </div>
        </div>
      </div>

      <div className="explain-rules-breakdown">
        {breakdown.map((b) => {
          // Weight proportion (hairline)
          const fillPercent = Math.min(100, Math.max(0, b.factor * 100));

          return (
            <div key={b.ruleKey} className="explain-rule-row">
              <div className="explain-rule-line">
                <span>{b.label}</span>
                <span>+{b.points.toFixed(1)} pts</span>
              </div>
              <div className="explain-hairline-track">
                <div
                  className="explain-hairline-fill"
                  style={{ width: `${fillPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="explain-decision">
        {isPlaced ? (
          <span>
            {placement.isManual ? 'Manual placement: ' : 'Optimal placement: '}
            Assigned to {placement.vehicleName} departing {placement.origin} for{' '}
            {placement.destination}, arriving at T+{placement.arrival}m.
          </span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span>Unresolved status</span>
            <span className="explain-unresolved-reason">
              Reason: {unresolvedInfo?.reason || 'Capacity exhausted across all qualifying services.'}
            </span>
          </div>
        )}
      </div>

      {!isPlaced && unresolvedInfo && unresolvedInfo.alternatives.length > 0 && (
        <div className="alternatives-container">
          <span className="alternative-title">Suggested Alternative Journeys</span>
          {unresolvedInfo.alternatives.map((alt, idx) => (
            <div key={`${alt.vehicleId}-${idx}`} className="alternative-row">
              <div>
                <strong>{alt.vehicleName}</strong>
                {alt.via ? (
                  <span> via {alt.via} (+{alt.onwardMin}m connection)</span>
                ) : (
                  <span> (direct service)</span>
                )}
                {' · '}
                <span>Arrives T+{alt.arrival}m</span>
                {' · '}
                <span
                  style={{
                    color: alt.delayVsDeadline <= 0 ? 'var(--signal)' : 'var(--mid-grey)',
                    fontWeight: 600,
                  }}
                >
                  [{alt.label}]
                </span>
              </div>

              {onPlaceAlternative && (
                <button
                  type="button"
                  className="alt-place-btn"
                  onClick={() => onPlaceAlternative(party.id, alt.vehicleId, alt.via)}
                >
                  Place
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
