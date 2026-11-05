import React from 'react';
import type { Party, Placement, UnresolvedParty, Rule } from '../engine/types';
import { calculateScore } from '../engine/score';
import { Explain } from './Explain';

interface LedgerProps {
  parties: Party[];
  placements: Record<string, Placement>;
  unresolvedMap: Map<string, UnresolvedParty>;
  rules: Rule[];
  expandedId: string | null;
  onToggleExpand: (partyId: string) => void;
  onPlaceAlternative: (partyId: string, vehicleId: string, stop?: string) => void;
}

export const Ledger: React.FC<LedgerProps> = ({
  parties,
  placements,
  unresolvedMap,
  rules,
  expandedId,
  onToggleExpand,
  onPlaceAlternative,
}) => {
  return (
    <div className="ledger-list" role="list">
      {parties.map((p) => {
        const placement = placements[p.id];
        const isPlaced = placement !== undefined;
        const isManual = placement?.isManual;
        const unresolvedInfo = unresolvedMap.get(p.id);
        const { score } = calculateScore(p, rules);
        const isExpanded = expandedId === p.id;

        return (
          <React.Fragment key={p.id}>
            <div
              role="listitem"
              tabIndex={0}
              className={`ledger-row ${isExpanded ? 'expanded' : ''}`}
              onClick={() => onToggleExpand(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggleExpand(p.id);
                }
              }}
              aria-expanded={isExpanded}
            >
              <div className="party-score num">{score.toFixed(0)}</div>

              <div className="party-info">
                <div className="party-primary">
                  <span className="party-label">{p.label}</span>
                  <span className="party-size num">({p.size} pax)</span>
                </div>
                <div className="party-journey">
                  {p.origin} → {p.dest}
                </div>
                <div className="party-attributes">
                  {p.wheelchair && <span>[Wheelchair]</span>}
                  {p.vulnerable && <span>[Vulnerable]</span>}
                  {p.confirmed && <span>[Confirmed]</span>}
                  <span>Wait {p.waitMin}m</span>
                  <span>Deadline T+{p.deadline}m</span>
                </div>
              </div>

              <div className="party-status">
                {!isPlaced ? (
                  <span className="status-unresolved">UNRESOLVED</span>
                ) : isManual ? (
                  <span className="status-manual">
                    <em>Manual: {placement.vehicleName}</em>
                  </span>
                ) : (
                  <span className="status-placed">
                    Placed: {placement.vehicleName}
                  </span>
                )}
              </div>
            </div>

            {isExpanded && (
              <Explain
                party={p}
                placement={placement}
                unresolvedInfo={unresolvedInfo}
                rules={rules}
                onPlaceAlternative={onPlaceAlternative}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
