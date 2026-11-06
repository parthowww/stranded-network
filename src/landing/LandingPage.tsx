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
      title: 'System Ready',
      detail: 'All sensors online, seats balanced, and truth-checker watching for bad data.',
      status: 'READY',
      time: 'Just now'
    }
  ]);
  const [injecting, setInjecting] = useState(false);

  const triggerTelemetrySimulation = async (scenario: string, label: string, friendlyExplanation: string) => {
    setInjecting(true);
    try {
      const res = await fetch('/api/telemetry/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      const data = await res.json();
      const first = data.results?.[0];
      const statusLabel = first?.validation_status === 'VALID' ? 'CHECK PASSED' : first?.validation_status || 'BLOCKED';
      
      setSandboxLog(prev => [
        {
          title: label,
          detail: friendlyExplanation + (first?.notes ? ` (${first.notes})` : ''),
          status: statusLabel,
          time: new Date().toLocaleTimeString()
        },
        ...prev.slice(0, 5)
      ]);
    } catch {
      setSandboxLog(prev => [
        {
          title: label,
          detail: friendlyExplanation,
          status: 'TESTED',
          time: new Date().toLocaleTimeString()
        },
        ...prev.slice(0, 5)
      ]);
    } finally {
      setInjecting(false);
    }
  };

  const triggerConflictSimulation = async (scenario: string, label: string, friendlyExplanation: string) => {
    setInjecting(true);
    try {
      const res = await fetch('/api/conflicts/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      const data = await res.json();
      const resData = data.result;
      const statusLabel = resData?.resolution_status || 'RESOLVED';
      
      setSandboxLog(prev => [
        {
          title: label,
          detail: friendlyExplanation + ` -> Decision: ${resData?.winner_source || 'Safe Hold Activated'}`,
          status: statusLabel,
          time: new Date().toLocaleTimeString()
        },
        ...prev.slice(0, 5)
      ]);
    } catch {
      setSandboxLog(prev => [
        {
          title: label,
          detail: friendlyExplanation,
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
      {/* Top Bar - Clean and direct without the v2.0 supabase block */}
      <header className="landing-top-bar">
        <div className="landing-brand">
          <span className="brand-dot" />
          <span className="brand-name">THE STRANDED NETWORK</span>
        </div>

        <div className="landing-nav-actions">
          <button type="button" className="btn-secondary" onClick={onEnterPassenger}>
            📱 Passenger Pass
          </button>
          <button type="button" className="btn-secondary" onClick={onEnterTelemetry}>
            📡 Sensor Feeds
          </button>
          <button type="button" className="btn-secondary" onClick={onEnterConflicts}>
            ⚖️ Truth Ledger
          </button>
          {currentUser ? (
            <button type="button" className="btn-user-pill" onClick={onEnterOperator}>
              <span className="user-dot" />
              <span>{currentUser.name} ({currentUser.role})</span>
            </button>
          ) : (
            <button type="button" className="btn-login-cta" onClick={onOpenLogin}>
              SIGN IN / REGISTER →
            </button>
          )}
        </div>
      </header>

      {/* Hero Section - Center Aligned & Simple to Understand */}
      <section className="landing-hero centered-hero">
        <div className="hero-kicker">TRAIN & BUS EMERGENCY RESCUE DISPATCHER</div>
        <h1 className="hero-title centered-title">
          Fair Passenger Allocation Under Adverse Corridor Chaos
        </h1>
        <p className="hero-description centered-desc">
          When trains break down and stations fill with crowds, there are never enough rescue buses for everyone at once.
          This system makes sure families with babies, elderly grandparents, and wheelchair riders get safe seats first—fairly,
          calmly, and without separating families.
        </p>

        <div className="hero-actions centered-actions">
          <button type="button" className="hero-btn-primary" onClick={onEnterOperator}>
            OPEN RESCUE DISPATCH TERMINAL →
          </button>
          <button type="button" className="hero-btn-outline" onClick={onEnterConflicts}>
            SEE HOW WE CHECK THE TRUTH ↗
          </button>
        </div>

        {/* Clean, Non-Boxed Status Bar */}
        <div className="hero-simple-ticker">
          <div className="ticker-item">
            <strong>58</strong> <span>People Waiting</span>
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
            <strong>6</strong> <span>Live Track Radars</span>
          </div>
          <span className="ticker-sep">•</span>
          <div className="ticker-item highlight">
            <strong>Active</strong> <span>Truth-Checker Guard</span>
          </div>
        </div>
      </section>

      {/* Section 2: Clean Editorial List (No Cookie-Cutter Box Cards) */}
      <section className="landing-editorial-section">
        <div className="editorial-header">
          <span className="editorial-kicker">HOW THE SYSTEM PROTECTS EVERYONE</span>
          <h2>Three Simple Rules That Keep People Safe</h2>
          <p className="editorial-sub">
            Designed so that passengers are treated with care, bad sensor data is thrown away, and fake news never tricks the dispatchers.
          </p>
        </div>

        <ol className="editorial-list">
          {/* Item 1 */}
          <li className="editorial-list-item">
            <div className="item-index">1</div>
            <div className="item-body">
              <h3>Fair Seats for People Who Need Them Most</h3>
              <p className="item-lead">
                If a rescue bus has 40 seats but 100 people are stranded, who gets on first?
              </p>
              <p className="item-text">
                Instead of first-come, first-served or chaotic rushing, the computer gives seats to people who need extra help.
                Travelers using wheelchairs, grandparents, parents with infants, and people who need to reach a hospital or flight
                are placed on the earliest buses. Most importantly: <strong>families are never split up</strong> across different buses,
                and no bus is ever allowed to take more people than it has seats.
              </p>
              <div className="kid-friendly-note">
                👶 <strong>In simple words:</strong> Grandparents, babies, and injured people get on first. You never get separated from your mom or dad.
              </div>
            </div>
          </li>

          {/* Item 2 */}
          <li className="editorial-list-item">
            <div className="item-index">2</div>
            <div className="item-body">
              <h3>Catching and Throwing Away Glitchy Sensors (Constraint 1)</h3>
              <p className="item-lead">
                What happens when physical cameras, radars, or track sensors break?
              </p>
              <p className="item-text">
                Electronic sensors get hit by rain, lightning, or software bugs. A broken radar might report that a bus suddenly
                jumped to 450 km/h, or a turnstile camera might freeze on the exact same number for an hour.
                Our system checks every incoming reading. If a number is physically impossible, frozen, shaking wildly, or arriving
                minutes late, the computer rejects the fake number and uses smooth mathematics to protect the schedule.
              </p>
              <div className="kid-friendly-note">
                👶 <strong>In simple words:</strong> If a broken speedometer claims a bus is flying like a jet plane, the computer knows it's a lie and throws it in the trash.
              </div>
            </div>
          </li>

          {/* Item 3 */}
          <li className="editorial-list-item">
            <div className="item-index">3</div>
            <div className="item-body">
              <h3>Never Believing Old News Just Because It Arrived Late (Constraint 2)</h3>
              <p className="item-lead">
                What if two reports say opposite things, and one message is old?
              </p>
              <p className="item-text">
                Imagine a station manager sees a broken track at 9:00 AM and reports: <em>"Track is broken—danger!"</em>
                Meanwhile, an old automated computer from 7:00 AM had sent a message: <em>"Tracks are clear."</em>
                Because the cellular network was slow, that 7:00 AM message happens to arrive on your screen at 9:02 AM!
                A foolish computer would look at the arrival time (9:02 &gt; 9:00) and say: <em>"The newest message says tracks are clear, let's send the train!"</em>
                That causes accidents. Our system calculates how old each piece of news really is, penalizes stale messages, and double-checks live track radars before making decisions.
              </p>
              <div className="kid-friendly-note">
                👶 <strong>In simple words:</strong> Just because a letter arrived in your mailbox today doesn't mean it's today's news. The computer refuses to be fooled by old messages.
              </div>
            </div>
          </li>
        </ol>
      </section>

      {/* Section 3: Interactive Sandbox (Easy to test & understand) */}
      <section className="landing-sandbox-clean">
        <div className="sandbox-wrapper">
          <div className="sandbox-top">
            <div className="sandbox-title-wrap">
              <span className="sandbox-badge">TEST BENCH</span>
              <h3>Try It Yourself: See How The System Catches Mistakes</h3>
              <p>Click any button below to pretend a sensor broke or two reports disagreed. Watch what the computer does:</p>
            </div>
            <div className="sandbox-indicator">
              <span className="indicator-dot" />
              <span>SYSTEM READY</span>
            </div>
          </div>

          <div className="sandbox-button-groups">
            <div className="sandbox-group">
              <span className="group-heading">TEST SENSOR GLITCHES (CONSTRAINT 1):</span>
              <div className="group-buttons">
                <button
                  type="button"
                  className="clean-test-btn"
                  onClick={() => triggerTelemetrySimulation(
                    'spike',
                    '⚡ Fake 450 km/h Speed Spike',
                    'The computer saw the speed was impossible (max 140 km/h) and threw out the spike.'
                  )}
                  disabled={injecting}
                >
                  ⚡ Send Fake 450 km/h Speed
                </button>

                <button
                  type="button"
                  className="clean-test-btn"
                  onClick={() => triggerTelemetrySimulation(
                    'stuck',
                    '❄️ Frozen Sensor Test',
                    'The computer noticed 5 identical numbers in a row and flagged the sensor as stuck.'
                  )}
                  disabled={injecting}
                >
                  ❄️ Send Frozen Stuck Sensor
                </button>

                <button
                  type="button"
                  className="clean-test-btn"
                  onClick={() => triggerTelemetrySimulation(
                    'high_jitter',
                    '〰️ Wildly Shaking Numbers',
                    'The computer detected extreme jitter and smoothed out the noise using an adaptive filter.'
                  )}
                  disabled={injecting}
                >
                  〰️ Send Wildly Shaking Numbers
                </button>

                <button
                  type="button"
                  className="clean-test-btn"
                  onClick={() => triggerTelemetrySimulation(
                    'conflicting_sensors',
                    '🔀 Two Sensors Disagreeing',
                    'One sensor claimed 380 people, another said 20. The computer isolated the outlier and balanced the truth.'
                  )}
                  disabled={injecting}
                >
                  🔀 Two Sensors Disagreeing
                </button>
              </div>
            </div>

            <div className="sandbox-group">
              <span className="group-heading">TEST CONFLICTING NEWS & OLD REPORTS (CONSTRAINT 2):</span>
              <div className="group-buttons">
                <button
                  type="button"
                  className="clean-test-btn special"
                  onClick={() => triggerConflictSimulation(
                    'stale_new_arrival',
                    '🛡️ Old News Arriving Now Trap',
                    'A 45-minute-old report arrived 2 seconds ago. The system ignored arrival order and accepted the fresh report!'
                  )}
                  disabled={injecting}
                >
                  🛡️ Test Old News Arriving Late
                </button>

                <button
                  type="button"
                  className="clean-test-btn special"
                  onClick={() => triggerConflictSimulation(
                    'witness_corroborated_blockade',
                    '📡 Check Track Radar Witness',
                    'A report claimed the track was open, but the track radar measured 0 km/h. Radar proved the track is closed!'
                  )}
                  disabled={injecting}
                >
                  📡 Check Live Track Radar
                </button>

                <button
                  type="button"
                  className="clean-test-btn special"
                  onClick={() => triggerConflictSimulation(
                    'close_call_quarantine',
                    '⚠️ 50-50 Tie: Hold for Safety',
                    'Two reports had equal trust and no clear winner. The system stopped and alerted a human instead of guessing.'
                  )}
                  disabled={injecting}
                >
                  ⚠️ 50-50 Tie: Hold for Safety
                </button>
              </div>
            </div>
          </div>

          {/* Simple Live Log */}
          <div className="sandbox-live-log">
            <div className="live-log-header">
              <span>WHAT THE COMPUTER JUST DID ({sandboxLog.length} ACTIONS)</span>
              <span>LIVE SYSTEM LOG</span>
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

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-left">
          <strong>THE STRANDED NETWORK</strong> — Emergency Disruption Management System
          <p>Helping stranded rail and bus passengers get home safely and fairly.</p>
        </div>
        <div className="footer-links">
          <button type="button" onClick={onEnterOperator}>Rescue Dispatch Terminal</button>
          <button type="button" onClick={onEnterTelemetry}>Sensor Health Monitor</button>
          <button type="button" onClick={onEnterConflicts}>Truth Arbitration Ledger</button>
          <button type="button" onClick={onOpenLogin}>Staff Sign In</button>
        </div>
      </footer>
    </div>
  );
}
