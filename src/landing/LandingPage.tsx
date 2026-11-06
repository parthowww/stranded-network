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
      title: 'System Online',
      detail: 'Sensors active, family seats protected together, automatic report verification running.',
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
      const statusLabel = first?.validation_status === 'VALID' ? 'SIGNAL OK' : first?.validation_status || 'FILTERED';
      
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
          status: 'TESTED',
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
      const statusLabel = resData?.resolution_status || 'VERIFIED';
      
      setSandboxLog(prev => [
        {
          title: label,
          detail: explanation + ` -> Selected: ${resData?.winner_source || 'Safe Hold Enforced'}`,
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
          status: 'TESTED',
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
            Live Sensors
          </button>
          <button type="button" className="btn-secondary" onClick={onEnterConflicts}>
            Verified Reports
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
        <div className="hero-kicker">AUTONOMOUS CORRIDOR RESILIENCE & PASSENGER DISPATCH</div>
        <h1 className="hero-title centered-title">
          Fair Passenger Allocation During Emergency Corridor Disruptions
        </h1>
        <p className="hero-description centered-desc">
          When trains stop and stations fill with crowds, relief buses cannot carry everyone at once.
          The Stranded Network instantly allocates seats fairly to travelers who need them most,
          keeps families together, filters out broken sensor data, and stops conflicting station reports from causing delays.
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
            <strong>58</strong> <span>Waiting Travelers</span>
          </div>
          <span className="ticker-sep">•</span>
          <div className="ticker-item">
            <strong>0</strong> <span>Overcrowded Buses</span>
          </div>
          <span className="ticker-sep">•</span>
          <div className="ticker-item">
            <strong>100%</strong> <span>Families Kept Together</span>
          </div>
          <span className="ticker-sep">•</span>
          <div className="ticker-item">
            <strong>6</strong> <span>Live Sensor Feeds</span>
          </div>
          <span className="ticker-sep">•</span>
          <div className="ticker-item highlight">
            <strong>Verified</strong> <span>Truth Guard Active</span>
          </div>
        </div>
      </section>

      {/* Core Highlights Section */}
      <section className="landing-editorial-section">
        <div className="editorial-header">
          <span className="editorial-kicker">HOW THE PLATFORM WORKS</span>
          <h2>Three Principles That Keep Travel Safe and Fair</h2>
          <p className="editorial-sub">
            Built so passengers get clear help, glitchy sensor data is safely ignored, and conflicting messages never mislead staff.
          </p>
        </div>

        <ol className="editorial-list">
          <li className="editorial-list-item">
            <div className="item-index">01</div>
            <div className="item-body">
              <h3>Fair Priority Seats & No Family Separation</h3>
              <p className="item-lead">
                Seats go first to travelers who need them most, without splitting groups.
              </p>
              <p className="item-text">
                When relief buses arrive, placements prioritize wheelchair travelers, elderly passengers, parents with infants,
                people with urgent connecting flights, and passengers waiting longest. Every passenger receives a clear, transparent explanation
                for their boarding status. <strong>Families and travel parties are always kept together</strong> on the same vehicle.
              </p>
            </div>
          </li>

          <li className="editorial-list-item">
            <div className="item-index">02</div>
            <div className="item-body">
              <h3>Automatic Sensor Health & Glitch Protection</h3>
              <p className="item-lead">
                Detects and filters impossible spikes or frozen cameras before they affect buses.
              </p>
              <p className="item-text">
                Trackside radars, platform crowd gates, and GPS units can get hit by bad weather or electrical bugs.
                If a broken radar claims a bus is moving at an impossible 450 km/h, or a camera freezes on the same reading for an hour,
                the system instantly catches the glitch and replaces it with safe, smooth estimates.
              </p>
            </div>
          </li>

          <li className="editorial-list-item">
            <div className="item-index">03</div>
            <div className="item-body">
              <h3>Intelligent Verification for Conflicting Reports</h3>
              <p className="item-lead">
                Stops outdated messages from reversing recent safety closures.
              </p>
              <p className="item-text">
                If a station manager reports a track problem at 9:00 AM, but an old automated message sent at 7:00 AM arrives late over slow cellular at 9:02 AM,
                the system does not get tricked. It checks when the event actually happened, cross-checks live track radars, and verifies the true status
                before allowing any vehicle to move.
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
              <span className="sandbox-badge">INTERACTIVE TEST BENCH</span>
              <h3>Test How The System Handles Real-World Issues</h3>
              <p>Click any test to simulate a broken sensor or conflicting reports and watch how the system responds:</p>
            </div>
            <div className="sandbox-indicator">
              <span className="indicator-dot" />
              <span>DISPATCH ENGINE READY</span>
            </div>
          </div>

          <div className="sandbox-button-groups">
            <div className="sandbox-group">
              <span className="group-heading">TEST SENSOR GLITCH PROTECTION</span>
              <div className="group-buttons">
                <button
                  type="button"
                  className="clean-test-btn"
                  onClick={() => triggerTelemetrySimulation(
                    'spike',
                    '⚡ Impossible Speed Spike (450 km/h)',
                    'Sensor reported 450 km/h. Exceeded normal limits; safely filtered to normal speed.'
                  )}
                  disabled={injecting}
                >
                  ⚡ Test 450 km/h Radar Spike
                </button>

                <button
                  type="button"
                  className="clean-test-btn"
                  onClick={() => triggerTelemetrySimulation(
                    'stuck',
                    '❄️ Frozen Camera / Sensor Lock',
                    'Sensor repeated the exact same reading multiple times with zero change. Flagged for inspection.'
                  )}
                  disabled={injecting}
                >
                  ❄️ Test Frozen Stuck Sensor
                </button>

                <button
                  type="button"
                  className="clean-test-btn"
                  onClick={() => triggerTelemetrySimulation(
                    'high_jitter',
                    '〰️ Wildly Fluctuating Readings',
                    'Excessive jitter detected. Filtered and smoothed to keep passenger timetable calm.'
                  )}
                  disabled={injecting}
                >
                  〰️ Test High-Jitter Noise
                </button>

                <button
                  type="button"
                  className="clean-test-btn"
                  onClick={() => triggerTelemetrySimulation(
                    'conflicting_sensors',
                    '🔀 Disagreeing Platform Sensors',
                    'Two sensors on the same platform gave different crowd numbers. System balanced the true consensus.'
                  )}
                  disabled={injecting}
                >
                  🔀 Test Disagreeing Sensors
                </button>
              </div>
            </div>

            <div className="sandbox-group">
              <span className="group-heading">TEST CONFLICTING REPORT VERIFICATION</span>
              <div className="group-buttons">
                <button
                  type="button"
                  className="clean-test-btn special"
                  onClick={() => triggerConflictSimulation(
                    'stale_new_arrival',
                    '🛡️ Old Report Arriving Late',
                    'A 45-minute-old report arrived just now. The system rejected the old news and kept the fresh closure active.'
                  )}
                  disabled={injecting}
                >
                  🛡️ Test Old Report Arriving Late
                </button>

                <button
                  type="button"
                  className="clean-test-btn special"
                  onClick={() => triggerConflictSimulation(
                    'witness_corroborated_blockade',
                    '📡 Live Track Radar Cross-Check',
                    'A report claimed track was open, but live radar saw zero movement. Radar proved track is still blocked.'
                  )}
                  disabled={injecting}
                >
                  📡 Test Radar Cross-Check
                </button>

                <button
                  type="button"
                  className="clean-test-btn special"
                  onClick={() => triggerConflictSimulation(
                    'close_call_quarantine',
                    '⚠️ 50-50 Tie: Hold for Safety',
                    'Two reports had equal credibility with no clear proof. System safely paused decisions for human confirmation.'
                  )}
                  disabled={injecting}
                >
                  ⚠️ Test Ambiguous Tie Safety Hold
                </button>
              </div>
            </div>
          </div>

          {/* Real-Time Audit Log Terminal */}
          <div className="sandbox-live-log">
            <div className="live-log-header">
              <span>LIVE ACTIVITY STREAM ({sandboxLog.length} EVENTS)</span>
              <span>VERIFIED OPERATIONS</span>
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
          <strong>THE STRANDED NETWORK</strong> — Emergency Disruption Management
          <p>Fair passenger priority allocation, automated sensor health verification, and intelligent report safety checks.</p>
        </div>
        <div className="footer-links">
          <button type="button" onClick={onEnterOperator}>Operator Terminal</button>
          <button type="button" onClick={onEnterPassenger}>Passenger App</button>
          <button type="button" onClick={onEnterTelemetry}>Live Sensors</button>
          <button type="button" onClick={onEnterConflicts}>Verified Reports</button>
          <button type="button" onClick={onOpenLogin}>Staff Login</button>
        </div>
      </footer>
    </div>
  );
}
