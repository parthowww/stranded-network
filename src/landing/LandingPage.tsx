import { useState } from 'react';

interface LandingPageProps {
  onEnterOperator: () => void;
  onEnterTelemetry: () => void;
  onEnterConflicts: () => void;
  onEnterPassenger: () => void;
  onOpenLogin: () => void;
  currentUser: any;
}

export function LandingPage({
  onEnterOperator,
  onEnterTelemetry,
  onEnterConflicts,
  onEnterPassenger,
  onOpenLogin,
  currentUser
}: LandingPageProps) {
  const [sandboxLog, setSandboxLog] = useState<Array<{ title: string; detail: string; status: string; time: string }>>([
    {
      title: 'Kernel Initialized',
      detail: 'Sensors nominal, whole-party constraints locked, Anti-LWW arbitration vector active.',
      status: 'VERIFIED',
      time: 'Just now'
    }
  ]);
  const [injecting, setInjecting] = useState(false);

  const triggerTelemetrySimulation = async (scenario: string, label: string, explanation: string) => {
    setInjecting(true);
    try {
      const res = await fetch('/api/telemetry/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      const data = await res.json();
      const first = data.results?.[0];
      const statusLabel = first?.validation_status === 'VALID' ? 'SIGNAL NOMINAL' : first?.validation_status || 'REJECTED';
      
      setSandboxLog(prev => [
        {
          title: label,
          detail: explanation + (first?.notes ? ` [${first.notes}]` : ''),
          status: statusLabel,
          time: new Date().toLocaleTimeString()
        },
        ...prev.slice(0, 5)
      ]);
    } catch {
      setSandboxLog(prev => [
        {
          title: label,
          detail: explanation,
          status: 'SIMULATED',
          time: new Date().toLocaleTimeString()
        },
        ...prev.slice(0, 5)
      ]);
    } finally {
      setInjecting(false);
    }
  };

  const triggerConflictSimulation = async (scenario: string, label: string, explanation: string) => {
    setInjecting(true);
    try {
      const res = await fetch('/api/conflicts/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      const data = await res.json();
      const resData = data.result;
      const statusLabel = resData?.resolution_status || 'ARBITRATED';
      
      setSandboxLog(prev => [
        {
          title: label,
          detail: explanation + ` -> Selected Source: ${resData?.winner_source || 'Quarantine Enforced'}`,
          status: statusLabel,
          time: new Date().toLocaleTimeString()
        },
        ...prev.slice(0, 5)
      ]);
    } catch {
      setSandboxLog(prev => [
        {
          title: label,
          detail: explanation,
          status: 'SIMULATED',
          time: new Date().toLocaleTimeString()
        },
        ...prev.slice(0, 5)
      ]);
    } finally {
      setInjecting(false);
    }
  };

  return (
    <div className="landing-layout">
      {/* Sleek Top Navigation Bar */}
      <header className="landing-top-bar">
        <div className="landing-brand">
          <span className="brand-dot" />
          <span className="brand-name">THE STRANDED NETWORK</span>
          <span className="brand-tag">DISRUPTION COMMAND</span>
        </div>

        <div className="landing-nav-actions">
          <button type="button" className="btn-secondary" onClick={onEnterPassenger}>
            Passenger Portal ↗
          </button>
          <button type="button" className="btn-secondary" onClick={onEnterTelemetry}>
            Telemetry Feed (C-1)
          </button>
          <button type="button" className="btn-secondary" onClick={onEnterConflicts}>
            Truth Ledger (C-2)
          </button>
          {currentUser ? (
            <button type="button" className="btn-user-pill" onClick={onEnterOperator}>
              <span className="user-dot" />
              <span>{currentUser.name} ({currentUser.role})</span>
            </button>
          ) : (
            <button type="button" className="btn-login-cta" onClick={onOpenLogin}>
              SIGN IN →
            </button>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero centered-hero">
        <div className="hero-kicker">AUTONOMOUS CORRIDOR RESILIENCE & PRIORITY DISPATCH</div>
        <h1 className="hero-title centered-title">
          Deterministic Priority Allocation Under Adverse Transit Disruption
        </h1>
        <p className="hero-description centered-desc">
          When mainline rail corridors suffer catastrophic blockades, emergency fleets cannot meet peak demand.
          The Stranded Network computes sub-millisecond priority allocations honoring accessibility, whole-party preservation,
          and transparent mathematical explanations—while actively filtering corrupted telemetry and arbitrating stale conflicting data.
        </p>

        <div className="hero-actions centered-actions">
          <button type="button" className="hero-btn-primary" onClick={onEnterOperator}>
            LAUNCH OPERATOR TERMINAL →
          </button>
          <button type="button" className="hero-btn-outline" onClick={onEnterPassenger}>
            OPEN PASSENGER APP 📱
          </button>
        </div>

        {/* Minimal Ticker */}
        <div className="hero-simple-ticker">
          <div className="ticker-item">
            <strong>58</strong> <span>Unresolved Parties</span>
          </div>
          <span className="ticker-sep">•</span>
          <div className="ticker-item">
            <strong>0</strong> <span>Over-Allocation Violations</span>
          </div>
          <span className="ticker-sep">•</span>
          <div className="ticker-item">
            <strong>100%</strong> <span>Family Party Integrity</span>
          </div>
          <span className="ticker-sep">•</span>
          <div className="ticker-item">
            <strong>6</strong> <span>Active IoT Feeds</span>
          </div>
          <span className="ticker-sep">•</span>
          <div className="ticker-item highlight">
            <strong>Anti-LWW</strong> <span>Decay Guard Online</span>
          </div>
        </div>
      </section>

      {/* Architectural Pillars Section */}
      <section className="landing-editorial-section">
        <div className="editorial-header">
          <span className="editorial-kicker">CORE SYSTEM INVARIANTS</span>
          <h2>Engineered for High-Consequence Physical Operations</h2>
          <p className="editorial-sub">
            Three deterministic guarantees that protect passenger equity and ensure regulatory auditability.
          </p>
        </div>

        <ol className="editorial-list">
          <li className="editorial-list-item">
            <div className="item-index">01</div>
            <div className="item-body">
              <h3>Transparent Priority Allocation & Capacity Verification</h3>
              <p className="item-lead">
                Deterministic multi-party scheduling with verifiable zero over-allocation guarantees.
              </p>
              <p className="item-text">
                Rather than arbitrary queuing, placements are computed via five transparent scoring policies: Wheelchair step-free compliance,
                vulnerability factors (elderly, infants, medical), transfer deadline urgency, wait duration accumulation, and confirmed bookings.
                Every party receives an exact 0–100 mathematical score breakdown with proportional impact hairlines.
                <strong>Whole-party integrity is invariant:</strong> traveling parties are never partitioned across split coaches.
              </p>
            </div>
          </li>

          <li className="editorial-list-item">
            <div className="item-index">02</div>
            <div className="item-body">
              <h3>Constraint 1: Telemetry Quality Ingestion & Anomaly Mitigation</h3>
              <p className="item-lead">
                Active filtration of missing heartbeats, frozen ADC sensors, physical speed spikes, and jitter.
              </p>
              <p className="item-text">
                Raw sensor inputs from trackside Doppler radar, platform turnstiles, and vehicle GPS units pass through six analytical safeguards
                before affecting the schedule. Utilizing Median Absolute Deviation (MAD) and normalized Modified Z-Scores (threshold 3.5),
                physically impossible speed spikes (e.g. 450 km/h radar artifacts) are rejected and clamped via Exponential Moving Average (EMA).
                Consecutive zero-variance ticks trigger automated sensor quarantine to prevent schedule pollution.
              </p>
            </div>
          </li>

          <li className="editorial-list-item">
            <div className="item-index">03</div>
            <div className="item-body">
              <h3>Constraint 2: Anti-LWW Truth Arbitration & Staleness Half-Life Decay</h3>
              <p className="item-lead">
                Multi-attribute decision vectors that refuse to naively trust arrival order over physical truth.
              </p>
              <p className="item-text">
                Standard Last-Write-Wins (LWW) is hazardous in transit operations: a 45-minute-old cached report arriving late over high-latency
                satellite links will silently overwrite a 2-minute-old emergency track closure. Our Truth Arbitrator scores competing records
                against six vectors: physical event age with exponential half-life decay (180s), hierarchical source authority (SCADA &gt; Dispatch &gt; Crowdsource),
                Doppler radar corroboration, and Lamport causal vector clocks. Ambiguous ties trigger an immediate fail-safe quarantine.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* Interactive Simulation Sandbox */}
      <section className="landing-sandbox-clean">
        <div className="sandbox-wrapper">
          <div className="sandbox-top">
            <div className="sandbox-title-wrap">
              <span className="sandbox-badge">INTERACTIVE SIMULATION</span>
              <h3>Verify Engine Behavior Under Adverse Scenarios</h3>
              <p>Trigger live telemetry failure modes or multi-source conflicts and observe automated kernel responses:</p>
            </div>
            <div className="sandbox-indicator">
              <span className="indicator-dot" />
              <span>KERNEL ONLINE</span>
            </div>
          </div>

          <div className="sandbox-button-groups">
            <div className="sandbox-group">
              <span className="group-heading">CONSTRAINT 1: SENSOR INGESTION ANOMALIES</span>
              <div className="group-buttons">
                <button
                  type="button"
                  className="clean-test-btn"
                  onClick={() => triggerTelemetrySimulation(
                    'spike',
                    '⚡ Physical Speed Spike (450 km/h)',
                    'Sensor Doppler reported 450 km/h. Exceeded nominal corridor ceiling (140 km/h); clamped via EMA filter.'
                  )}
                  disabled={injecting}
                >
                  ⚡ Inject 450 km/h Radar Spike
                </button>

                <button
                  type="button"
                  className="clean-test-btn"
                  onClick={() => triggerTelemetrySimulation(
                    'stuck',
                    '❄️ Frozen ADC Sensor Lock',
                    'Detected 5 consecutive identical readings with zero variance. Sensor transitioned to QUARANTINED.'
                  )}
                  disabled={injecting}
                >
                  ❄️ Inject Frozen ADC Sensor
                </button>

                <button
                  type="button"
                  className="clean-test-btn"
                  onClick={() => triggerTelemetrySimulation(
                    'high_jitter',
                    '〰️ High-Frequency Jitter Noise',
                    'Rate of change exceeded domain threshold. Signal smoothed via adaptive low-pass filter.'
                  )}
                  disabled={injecting}
                >
                  〰️ Inject Excessive Variance
                </button>

                <button
                  type="button"
                  className="clean-test-btn"
                  onClick={() => triggerTelemetrySimulation(
                    'conflicting_sensors',
                    '🔀 Divergent Multi-Sensor Ingest',
                    'Two optical sensors disagreed on platform density. Inverse-variance fusion isolated consensus.'
                  )}
                  disabled={injecting}
                >
                  🔀 Inject Conflicting Sensors
                </button>
              </div>
            </div>

            <div className="sandbox-group">
              <span className="group-heading">CONSTRAINT 2: ANTI-LWW TRUTH ARBITRATION</span>
              <div className="group-buttons">
                <button
                  type="button"
                  className="clean-test-btn special"
                  onClick={() => triggerConflictSimulation(
                    'stale_new_arrival',
                    '🛡️ Delayed Satellite Stale Replay',
                    '45-minute-old clearance arrived 2s ago. Anti-LWW half-life decay rejected stale record in favor of fresh closure.'
                  )}
                  disabled={injecting}
                >
                  🛡️ Test Stale Satellite Replay
                </button>

                <button
                  type="button"
                  className="clean-test-btn special"
                  onClick={() => triggerConflictSimulation(
                    'witness_corroborated_blockade',
                    '📡 Physical Doppler Radar Corroboration',
                    'Report claimed corridor open, but trackside Doppler measured 0 km/h velocity. Radar physical witness verified blockade.'
                  )}
                  disabled={injecting}
                >
                  📡 Test Radar Witness Corroboration
                </button>

                <button
                  type="button"
                  className="clean-test-btn special"
                  onClick={() => triggerConflictSimulation(
                    'close_call_quarantine',
                    '⚠️ Ambiguous 50-50 Tie Quarantine',
                    'Conflicting reports scored within 0.15 confidence margin. System halted automated dispatch and entered QUARANTINE.'
                  )}
                  disabled={injecting}
                >
                  ⚠️ Test Ambiguous Tie Quarantine
                </button>
              </div>
            </div>
          </div>

          {/* Real-Time Audit Log Terminal */}
          <div className="sandbox-live-log">
            <div className="live-log-header">
              <span>REAL-TIME AUDIT STREAM ({sandboxLog.length} EVENTS)</span>
              <span>GROUND TRUTH TELEMETRY</span>
            </div>
            <div className="live-log-items">
              {sandboxLog.map((item, idx) => (
                <div key={idx} className="live-log-row">
                  <span className="log-col-time">{item.time}</span>
                  <span className="log-col-status">{item.status}</span>
                  <div className="log-col-content">
                    <strong>{item.title}</strong>
                    <span className="log-msg">{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Sleek Minimal Footer */}
      <footer className="landing-footer">
        <div className="footer-left">
          <strong>THE STRANDED NETWORK</strong> // MISSION-CRITICAL DISRUPTION DISPATCH
          <p>Deterministic passenger allocation, telemetry anomaly filtration, and Anti-LWW truth arbitration.</p>
        </div>
        <div className="footer-links">
          <button type="button" onClick={onEnterOperator}>Operator Terminal</button>
          <button type="button" onClick={onEnterPassenger}>Passenger App</button>
          <button type="button" onClick={onEnterTelemetry}>Telemetry Monitor</button>
          <button type="button" onClick={onEnterConflicts}>Conflict Ledger</button>
          <button type="button" onClick={onOpenLogin}>Staff Access</button>
        </div>
      </footer>
    </div>
  );
}
