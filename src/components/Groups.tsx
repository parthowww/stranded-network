import React, { useState } from 'react';
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
  const [view, setView] = useState<'map' | 'list'>('map');
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
  const stops = ['Chennai Central', 'Tambaram', 'Arakkonam', 'Katpadi', 'Vellore', 'Salem', 'Erode', 'Coimbatore', 'Madurai'];
  const stationPoints = [
    { name: 'Chennai Central', x: 96, y: 95 }, { name: 'Tambaram', x: 96, y: 195 },
    { name: 'Arakkonam', x: 250, y: 75 }, { name: 'Katpadi', x: 365, y: 110 },
    { name: 'Vellore', x: 490, y: 75 }, { name: 'Salem', x: 550, y: 170 },
    { name: 'Erode', x: 700, y: 170 }, { name: 'Coimbatore', x: 815, y: 120 },
    { name: 'Madurai', x: 815, y: 225 },
  ];
  const getPoint = (name: string) => stationPoints.find((point) => point.name === name);
  const maxDemand = Math.max(1, ...sortedGroups.map((group) => group.totalPassengers));

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Passenger Corridor Flows</h2>
        <div className="corridor-view-switch" role="group" aria-label="Corridor display">
          <button type="button" className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>Map</button>
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button>
        </div>
      </div>

      {view === 'map' ? (
        <div className="corridor-map-wrap">
          <div className="corridor-map-heading">
            <span>Passenger demand by corridor</span>
            <span>Route schematic · not to scale</span>
          </div>
          <div className="corridor-map-scroll">
            <svg className="corridor-map" viewBox="0 0 900 290" role="img" aria-label="Schematic map of passenger corridors and demand across the relief network">
              <path className="map-rail map-rail-main" d="M96 95 Q180 95 250 75 L365 110 Q430 110 490 75 Q510 115 550 170 L700 170 Q765 170 815 120 M96 195 Q185 195 250 75 M700 170 Q770 195 815 225" />
              {sortedGroups.map((group) => {
                const origin = getPoint(group.origin);
                const destination = getPoint(group.dest);
                if (!origin || !destination) return null;
                const unresolvedShare = group.unresolvedPassengers / Math.max(1, group.totalPassengers);
                const width = 2 + (group.totalPassengers / maxDemand) * 6;
                const midX = (origin.x + destination.x) / 2;
                const midY = (origin.y + destination.y) / 2 - 22;
                return <g key={`${group.origin}-${group.dest}`}>
                  <path className={`map-flow ${unresolvedShare > 0 ? 'has-unresolved' : 'all-placed'}`} d={`M${origin.x} ${origin.y} Q${midX} ${midY} ${destination.x} ${destination.y}`} strokeWidth={width} />
                  <title>{group.origin} to {group.dest}: {group.totalPassengers} passengers, {group.placedPassengers} placed, {group.unresolvedPassengers} waiting</title>
                </g>;
              })}
              {stationPoints.map((point) => {
                const demand = sortedGroups.filter((group) => group.origin === point.name || group.dest === point.name).reduce((sum, group) => sum + group.totalPassengers, 0);
                return <g key={point.name} className="map-station" transform={`translate(${point.x},${point.y})`}>
                  <circle r="6" />
                  <text x="0" y={point.y > 150 ? '22' : '-14'} textAnchor="middle">{point.name}</text>
                  {demand > 0 && <text className="map-station-demand" x="0" y={point.y > 150 ? '37' : '-1'} textAnchor="middle">{demand} pax</text>}
                </g>;
              })}
            </svg>
          </div>
          <div className="corridor-map-legend"><span><i className="legend-placed" /> Corridor demand</span><span><i className="legend-unresolved" /> Includes passengers awaiting placement</span><span>{sortedGroups.length} active corridors</span></div>
        </div>
      ) : <div className="groups-list">
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
      </div>}
    </section>
  );
};
