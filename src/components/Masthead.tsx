import React from 'react';
import NumberFlow from '@number-flow/react';

interface MastheadProps {
  unresolvedCount: number;
  unresolvedDemand: number;
  totalPassengers: number;
  totalSeats: number;
  placedDemand: number;
  isOk: boolean;
  originsCount: number;
  vehiclesRunningCount: number;
  totalVehiclesCount: number;
}

export const Masthead: React.FC<MastheadProps> = ({
  unresolvedDemand,
  totalPassengers,
  totalSeats,
  placedDemand,
  isOk,
  originsCount,
  vehiclesRunningCount,
  totalVehiclesCount,
}) => {
  // Interpolate font-variation-settings for Bricolage Grotesque
  // wght: 200 (light) at 0 unresolved -> 800 (heavy) at 50+ unresolved
  // wdth: 75 (condensed) at 0 unresolved -> 100 (wide) at 50+ unresolved
  const progress = Math.min(1, Math.max(0, unresolvedDemand / 45));
  const wght = Math.round(200 + progress * 600);
  const wdth = Math.round(75 + progress * 25);

  const styleSettings = {
    fontVariationSettings: `'wght' ${wght}, 'wdth' ${wdth}`,
  };

  return (
    <header className="masthead-container">
      <div className="masthead-numeral-wrap">
        <div className="masthead-numeral" style={styleSettings}>
          <NumberFlow value={unresolvedDemand} />
        </div>
        <div className="masthead-unit">
          {unresolvedDemand === 0 ? 'Passengers' : 'Unresolved passengers'}
        </div>
      </div>

      <div className="masthead-statement">
        {unresolvedDemand === 0 ? (
          <span className="masthead-all-resolved">
            Everyone is placed. All {totalPassengers} stranded passengers accommodated.
          </span>
        ) : (
          <span>
            {totalPassengers} passengers stranded across {originsCount} origins; {vehiclesRunningCount} of {totalVehiclesCount} replacement vehicles running.
          </span>
        )}
      </div>

      <div className="masthead-metrics-strip">
        <div className="metric-block">
          <span className="metric-value num">
            <NumberFlow value={totalPassengers} />
          </span>
          <span className="metric-label">Affected demand</span>
        </div>
        <div className="metric-block">
          <span className="metric-value num">
            <NumberFlow value={totalSeats} />
          </span>
          <span className="metric-label">Available seats</span>
        </div>
        <div className="metric-block">
          <span className="metric-value num">
            <NumberFlow value={placedDemand} />
          </span>
          <span className="metric-label">Placed demand</span>
        </div>
        <div className="metric-block">
          <span className="metric-value num">
            <NumberFlow value={unresolvedDemand} />
          </span>
          <span className="metric-label">Unresolved demand</span>
        </div>
      </div>

      <div className="capacity-indicator-ok">
        {isOk ? (
          <span>✓ Capacity verified: no vehicle over-allocated</span>
        ) : (
          <span style={{ color: '#E53E3E' }}>⚠ Capacity alert: vehicle seats exceeded</span>
        )}
      </div>
    </header>
  );
};
