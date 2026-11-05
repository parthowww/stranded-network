import React from 'react';
import type { Party, Placement } from '../engine/types';

interface GroupsProps {
  parties: Party[];
  placements: Record<string, Placement>;
}

interface GroupSummary {
  origin: string;
  dest: string;
  totalPassengers: number;
  placedPassengers: number;
  unresolvedPassengers: number;
}

export const Groups: React.FC<GroupsProps> = ({ parties, placements }) => {
  const groupsMap = new Map<string, GroupSummary>();

  for (const p of parties) {
    const key = `${p.origin} → ${p.dest}`;
    const isPlaced = placements[p.id] !== undefined;

    const existing = groupsMap.get(key) || {
      origin: p.origin,
      dest: p.dest,
      totalPassengers: 0,
      placedPassengers: 0,
      unresolvedPassengers: 0,
    };

    existing.totalPassengers += p.size;
    if (isPlaced) {
      existing.placedPassengers += p.size;
    } else {
      existing.unresolvedPassengers += p.size;
    }

    groupsMap.set(key, existing);
  }

  const sortedGroups = Array.from(groupsMap.values()).sort(
    (a, b) => b.totalPassengers - a.totalPassengers
  );

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Passenger Corridor Flows</h2>
        <span className="num" style={{ fontSize: 'var(--text-xs)', color: 'var(--mid-grey)' }}>
          {sortedGroups.length} Corridors
        </span>
      </div>

      <div className="groups-list">
        {sortedGroups.map((g) => (
          <div key={`${g.origin}-${g.dest}`} className="group-row">
            <span className="group-flow">
              {g.origin} → {g.dest}
            </span>
            <span className="group-counts">
              <strong>{g.placedPassengers}</strong> placed / {g.unresolvedPassengers} unresolved
              {' '}
              <span style={{ color: 'var(--mid-grey)', fontSize: '11px' }}>
                ({g.totalPassengers} total)
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};
