import React from 'react';
import type { Vehicle } from '../engine/types';

interface CapacityProps {
  vehicles: Vehicle[];
  used: Record<string, number>;
  accUsed: Record<string, number>;
  closedStops: Set<string>;
}

export const Capacity: React.FC<CapacityProps> = ({
  vehicles,
  used,
  accUsed,
}) => {
  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Fleet Capacity</h2>
        <span className="num" style={{ fontSize: 'var(--text-xs)', color: 'var(--mid-grey)' }}>
          {vehicles.filter((v) => v.on).length} Active Services
        </span>
      </div>

      <div className="vehicles-capacity-list">
        {vehicles.map((v) => {
          const u = used[v.id] || 0;
          const au = accUsed[v.id] || 0;
          const isCancelled = !v.on;

          // Build glyph string: '█' for used, '░' for free
          // Max seats is ~36, so 1 glyph per seat renders cleanly
          const usedCount = Math.min(u, v.seats);
          const freeCount = Math.max(0, v.seats - u);
          const usedGlyphs = '█'.repeat(usedCount);
          const freeGlyphs = '░'.repeat(freeCount);

          return (
            <div
              key={v.id}
              className={`vehicle-row ${isCancelled ? 'cancelled' : ''}`}
            >
              <div className="vehicle-meta">
                <span className="vehicle-name">{v.name}</span>
                <span className="vehicle-route-badge">
                  {v.from} · Dep +{v.dep}m {v.delay > 0 ? `(+${v.delay}m delay)` : ''}
                </span>
              </div>

              {isCancelled ? (
                <div className="vehicle-capacity-bar">
                  <span style={{ fontWeight: 700, letterSpacing: '0.05em' }}>
                    NOT RUNNING — SERVICE CANCELLED
                  </span>
                </div>
              ) : (
                <div className="vehicle-capacity-bar">
                  <div className="glyph-bar" aria-hidden="true">
                    <span className="glyph-used">{usedGlyphs}</span>
                    <span className="glyph-free">{freeGlyphs}</span>
                  </div>
                  <span className="vehicle-numbers">
                    {u} / {v.seats} seats
                  </span>
                  <span className="vehicle-numbers">
                    acc {au} / {v.accSeats}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
