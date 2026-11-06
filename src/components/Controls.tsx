import React, { useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import * as Slider from '@radix-ui/react-slider';
import type { Vehicle, Rule } from '../engine/types';

export interface ControlsProps {
  vehicles: Vehicle[];
  rules: Rule[];
  closedStops: Set<string>;
  allStops: string[];
  decisionLog: string[];
  theme: 'light' | 'dark';
  isOpen?: boolean;
  onToggleOpen?: () => void;
  onToggleVehicle: (id: string) => void;
  onUpdateVehicleSeats: (id: string, seats: number) => void;
  onUpdateVehicleDelay: (id: string, delay: number) => void;
  onToggleStopClosed: (stop: string) => void;
  onUpdateRuleWeight: (ruleKey: string, weight: number) => void;
  onToggleTheme: () => void;
  onResetScenario: () => void;
}

type ControlTab = 'fleet' | 'closures' | 'rules';

export const Controls: React.FC<ControlsProps> = ({
  vehicles,
  rules,
  closedStops,
  allStops,
  decisionLog,
  theme,
  isOpen = true,
  onToggleOpen,
  onToggleVehicle,
  onUpdateVehicleSeats,
  onUpdateVehicleDelay,
  onToggleStopClosed,
  onUpdateRuleWeight,
  onToggleTheme,
  onResetScenario,
}) => {
  const [activeTab, setActiveTab] = useState<ControlTab>('fleet');
  const [showLog, setShowLog] = useState<boolean>(false);

  const activeVehiclesCount = vehicles.filter((v) => v.on).length;

  if (!isOpen) {
    return (
      <aside className="controls-column controls-collapsed-strip">
        <button
          type="button"
          className="controls-expand-strip-btn"
          onClick={onToggleOpen}
          title="Open Controls Panel"
          aria-label="Open Controls"
        >
          <span>◀ CONTROLS</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="controls-column">
      <div className="controls-header">
        <div>
          <h2 className="section-title">Controls</h2>
          <span style={{ fontSize: '11px', color: 'var(--mid-grey)', fontFamily: 'var(--font-mono)' }}>
            Station Dispatch Settings
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={onToggleTheme}
            aria-label="Toggle dark/light theme"
          >
            {theme === 'dark' ? 'Dark ☾' : 'Light ☼'}
          </button>
          {onToggleOpen && (
            <button
              type="button"
              className="controls-collapse-btn"
              onClick={onToggleOpen}
              title="Collapse Controls Panel"
              aria-label="Collapse Controls"
            >
              ▶ HIDE
            </button>
          )}
        </div>
      </div>

      {/* Control Segmented Tabs */}
      <div className="control-tabs-bar">
        <button
          type="button"
          className={`control-tab-btn ${activeTab === 'fleet' ? 'active' : ''}`}
          onClick={() => setActiveTab('fleet')}
        >
          Fleet ({activeVehiclesCount}/{vehicles.length})
        </button>
        <button
          type="button"
          className={`control-tab-btn ${activeTab === 'closures' ? 'active' : ''}`}
          onClick={() => setActiveTab('closures')}
        >
          Closures {closedStops.size > 0 ? `(${closedStops.size})` : ''}
        </button>
        <button
          type="button"
          className={`control-tab-btn ${activeTab === 'rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          Weights
        </button>
      </div>

      <div className="controls-body">
        {/* Tab 1: Fleet Toggles */}
        {activeTab === 'fleet' && (
          <div className="controls-group">
            <span className="group-label">Toggle Vehicle Availability & Seats</span>
            {vehicles.map((v) => (
              <div key={v.id} className="vehicle-control-row">
                <div className="vehicle-control-header">
                  <span className="vehicle-control-name">
                    {v.name}
                    {v.accSeats > 0 && <span className="acc-tag">♿ {v.accSeats}</span>}
                  </span>
                  <Switch.Root
                    className="switch-root"
                    checked={v.on}
                    onCheckedChange={() => onToggleVehicle(v.id)}
                    aria-label={`Toggle ${v.name}`}
                  >
                    <Switch.Thumb className="switch-thumb" />
                  </Switch.Root>
                </div>

                <div className="vehicle-control-sub">
                  <span className="sub-detail">
                    {v.from} → {Object.keys(v.stops).join(' → ')}
                  </span>
                </div>

                {v.on && (
                  <div className="vehicle-modifiers">
                    <div className="modifier-item">
                      <label htmlFor={`seats-${v.id}`}>Seats:</label>
                      <input
                        id={`seats-${v.id}`}
                        type="number"
                        min="0"
                        max="200"
                        value={v.seats}
                        onChange={(e) =>
                          onUpdateVehicleSeats(v.id, parseInt(e.target.value, 10) || 0)
                        }
                        className="modifier-input"
                      />
                    </div>
                    <div className="modifier-item">
                      <label htmlFor={`delay-${v.id}`}>Delay (m):</label>
                      <input
                        id={`delay-${v.id}`}
                        type="number"
                        min="0"
                        max="240"
                        value={v.delay}
                        onChange={(e) =>
                          onUpdateVehicleDelay(v.id, parseInt(e.target.value, 10) || 0)
                        }
                        className="modifier-input"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: Corridor Stop Closures */}
        {activeTab === 'closures' && (
          <div className="controls-group">
            <span className="group-label">Corridor Stop Closures</span>
            <p className="controls-hint">
              Closing a stop truncates vehicles at that stop; all downstream stations become unreachable.
            </p>
            <div className="stops-grid">
              {allStops.map((stop) => {
                const isClosed = closedStops.has(stop);
                return (
                  <button
                    key={stop}
                    type="button"
                    className={`stop-toggle-btn ${isClosed ? 'closed' : 'open'}`}
                    onClick={() => onToggleStopClosed(stop)}
                  >
                    <span className="stop-status-dot" />
                    <span className="stop-name">{stop}</span>
                    <span className="stop-tag">{isClosed ? 'BLOCKED' : 'OPEN'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Priority Scoring Rule Weights */}
        {activeTab === 'rules' && (
          <div className="controls-group">
            <span className="group-label">Priority Weights (0–50)</span>
            {rules.map((r) => (
              <div key={r.key} className="rule-slider-row">
                <div className="rule-slider-header">
                  <span className="rule-name">{r.label}</span>
                  <span className="rule-weight-value">{r.weight}</span>
                </div>
                <Slider.Root
                  className="slider-root"
                  value={[r.weight]}
                  max={50}
                  step={1}
                  onValueChange={(val) => onUpdateRuleWeight(r.key, val[0])}
                  aria-label={r.label}
                >
                  <Slider.Track className="slider-track">
                    <Slider.Range className="slider-range" />
                  </Slider.Track>
                  <Slider.Thumb className="slider-thumb" />
                </Slider.Root>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Decision Log Toggle Drawer */}
      <div className="controls-group" style={{ borderTop: '1px solid var(--rule)' }}>
        <button
          type="button"
          className="collapsible-toggle-btn"
          onClick={() => setShowLog(!showLog)}
          style={{ width: '100%', textAlign: 'left', marginBottom: showLog ? '10px' : '0' }}
        >
          <span>{showLog ? '▲ Hide' : '▼ View'} Decision Log ({decisionLog.length})</span>
        </button>

        {showLog && (
          <div className="decision-log-list">
            {decisionLog.map((line, idx) => (
              <div key={idx} className="decision-log-entry">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reset */}
      <div className="controls-group" style={{ marginTop: 'auto' }}>
        <button
          type="button"
          className="reset-button"
          onClick={onResetScenario}
        >
          Reset Scenario
        </button>
      </div>
    </aside>
  );
};
