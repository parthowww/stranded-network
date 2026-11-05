import React, { useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import * as Slider from '@radix-ui/react-slider';
import type { Vehicle, Rule } from '../engine/types';

interface ControlsProps {
  vehicles: Vehicle[];
  rules: Rule[];
  closedStops: Set<string>;
  allStops: string[];
  decisionLog: string[];
  theme: 'light' | 'dark';
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

  return (
    <aside className="controls-column">
      <div className="controls-header">
        <div>
          <h2 className="section-title">Controls</h2>
          <span style={{ fontSize: '11px', color: 'var(--mid-grey)', fontFamily: 'var(--font-mono)' }}>
            Station Dispatch Settings
          </span>
        </div>
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={onToggleTheme}
          aria-label="Toggle dark/light theme"
        >
          Theme: {theme === 'dark' ? 'Dark ☾' : 'Light ☼'}
        </button>
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
          Policy Rules
        </button>
      </div>

      <div className="control-tab-content">
        {/* Tab 1: Fleet */}
        {activeTab === 'fleet' && (
          <div className="controls-group" style={{ borderBottom: 'none' }}>
            <h3 className="controls-group-title">Fleet Dispatch & Delays</h3>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--mid-grey)', marginBottom: '12px' }}>
              Toggle replacement coaches or adjust departure delays.
            </p>

            <div className="vehicles-controls-list">
              {vehicles.map((v) => (
                <div key={v.id} className="control-vehicle-item">
                  <div className="control-vehicle-head">
                    <div>
                      <strong style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)' }}>
                        {v.name}
                      </strong>
                      <div style={{ fontSize: '11px', color: 'var(--mid-grey)', fontFamily: 'var(--font-mono)' }}>
                        {v.from} · Base dep +{v.dep}m
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                        {v.on ? 'Active' : 'Cancelled'}
                      </span>
                      <Switch.Root
                        className="radix-switch-root"
                        checked={v.on}
                        onCheckedChange={() => onToggleVehicle(v.id)}
                        aria-label={`Toggle ${v.name}`}
                      >
                        <Switch.Thumb className="radix-switch-thumb" />
                      </Switch.Root>
                    </div>
                  </div>

                  {v.on && (
                    <div className="control-vehicle-fields">
                      <div className="control-field">
                        <label>Seats ({v.seats})</label>
                        <input
                          type="number"
                          min={1}
                          max={80}
                          value={v.seats}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val >= 0) {
                              onUpdateVehicleSeats(v.id, val);
                            }
                          }}
                        />
                      </div>

                      <div className="control-field">
                        <label>Delay (min)</label>
                        <input
                          type="number"
                          min={0}
                          max={300}
                          step={5}
                          value={v.delay}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val >= 0) {
                              onUpdateVehicleDelay(v.id, val);
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Closures */}
        {activeTab === 'closures' && (
          <div className="controls-group" style={{ borderBottom: 'none' }}>
            <h3 className="controls-group-title">Corridor Closures</h3>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--mid-grey)', marginBottom: '14px' }}>
              Click any affected station to declare it closed. Route truncates at the first closed stop.
            </p>
            <div className="stop-closures-grid">
              {allStops.map((stop) => {
                const isClosed = closedStops.has(stop);
                return (
                  <button
                    key={stop}
                    type="button"
                    className={`stop-tag ${isClosed ? 'closed' : ''}`}
                    onClick={() => onToggleStopClosed(stop)}
                    aria-pressed={isClosed}
                  >
                    {stop} {isClosed ? '✕ CLOSED' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Priority Policy Rules */}
        {activeTab === 'rules' && (
          <div className="controls-group" style={{ borderBottom: 'none' }}>
            <h3 className="controls-group-title">Priority Policy Weights</h3>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--mid-grey)', marginBottom: '14px' }}>
              Adjust allocation weight per rule (0–100). Allocation recalculates instantaneously.
            </p>

            {rules.map((rule) => (
              <div key={rule.key} className="rule-slider-item">
                <div className="rule-slider-header">
                  <span>{rule.label}</span>
                  <span className="rule-slider-weight num">{rule.weight}</span>
                </div>
                <p className="rule-slider-desc">{rule.description}</p>
                <Slider.Root
                  className="radix-slider-root"
                  value={[rule.weight]}
                  max={100}
                  step={1}
                  onValueChange={([val]) => onUpdateRuleWeight(rule.key, val)}
                  aria-label={rule.label}
                >
                  <Slider.Track className="radix-slider-track">
                    <Slider.Range className="radix-slider-range" />
                  </Slider.Track>
                  <Slider.Thumb className="radix-slider-thumb" />
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
          <span>{showLog ? '▲ Hide' : '▼ View'} Engine Decision Audit Log ({decisionLog.length})</span>
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
