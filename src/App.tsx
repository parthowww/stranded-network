import { useState, useMemo, useEffect } from 'react';
import { generateSeedData } from './data/seed';
import { DEFAULT_RULES } from './engine/score';
import { allocate } from './engine/allocate';
import type { Vehicle, Rule, ManualOverride } from './engine/types';
import { syncManager } from './sync/broadcast';
import { CustomerApp } from './customer/CustomerApp';
import { Masthead } from './components/Masthead';
import { Capacity } from './components/Capacity';
import { Groups } from './components/Groups';
import { Parties } from './components/Parties';
import { Controls } from './components/Controls';
import { LandingPage } from './landing/LandingPage';
import { LoginPage } from './auth/LoginPage';
import { TelemetryMonitor } from './telemetry/TelemetryMonitor';
import { ConflictLedger } from './conflicts/ConflictLedger';
import { authStore, type UserProfile } from './auth/authStore';
import './styles.css';

const INITIAL_DATA = generateSeedData();

const ALL_STOPS = [
  'Arakkonam',
  'Katpadi',
  'Vellore',
  'Salem',
  'Erode',
  'Coimbatore',
  'Madurai',
];

type OperatorTab = 'overview' | 'roster' | 'corridors' | 'telemetry' | 'conflicts' | 'all';
type ViewMode = 'landing' | 'operator' | 'passenger' | 'login';

export function App() {
  const [parties] = useState(INITIAL_DATA.parties);
  const [vehicles, setVehicles] = useState<Vehicle[]>(INITIAL_DATA.vehicles);
  const [rules, setRules] = useState<Rule[]>(DEFAULT_RULES);
  const [closedStops, setClosedStops] = useState<Set<string>>(new Set());
  const [manualOverrides, setManualOverrides] = useState<Record<string, ManualOverride>>({});
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Active User session
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => authStore.getUser());

  // Navigation tab for Operator Dashboard
  const [operatorTab, setOperatorTab] = useState<OperatorTab>('overview');

  // View state: 'landing' vs 'operator' vs 'passenger' vs 'login'
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('view');
      if (v === 'passenger') return 'passenger';
      if (v === 'operator') return 'operator';
      if (v === 'login') return 'login';
      if (v === 'landing') return 'landing';
    }
    return 'landing'; // Default landing page
  });

  const [controlsOpen, setControlsOpen] = useState<boolean>(true);

  // Keep data-theme on html element in sync
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Broadcast any operator state changes to any connected customer phone app tabs
  useEffect(() => {
    const ruleWeights: Record<string, number> = {};
    for (const r of rules) {
      ruleWeights[r.key] = r.weight;
    }

    syncManager.broadcast({
      vehicles,
      ruleWeights,
      closedStops: Array.from(closedStops),
      manualOverrides,
      updatedAt: Date.now(),
    });
  }, [vehicles, rules, closedStops, manualOverrides]);

  // Listen to incoming changes (e.g. passenger accepting an alternative on phone)
  useEffect(() => {
    const unsubscribe = syncManager.subscribe((payload) => {
      setManualOverrides((prev) => {
        if (JSON.stringify(prev) !== JSON.stringify(payload.manualOverrides)) {
          return payload.manualOverrides;
        }
        return prev;
      });
    });
    return unsubscribe;
  }, []);

  // Central allocation engine call
  const result = useMemo(() => {
    return allocate({
      parties,
      vehicles,
      rules,
      closedStops,
      manualOverrides,
      onwardLinks: INITIAL_DATA.onwardLinks,
    });
  }, [parties, vehicles, rules, closedStops, manualOverrides]);

  // Totals and summaries
  const totalPassengers = useMemo(
    () => parties.reduce((sum, p) => sum + p.size, 0),
    [parties]
  );

  const totalSeats = useMemo(
    () => vehicles.filter((v) => v.on).reduce((sum, v) => sum + v.seats, 0),
    [vehicles]
  );

  const placedDemand = useMemo(() => {
    return Object.keys(result.placements).reduce((sum, partyId) => {
      const p = parties.find((party) => party.id === partyId);
      return sum + (p?.size || 0);
    }, 0);
  }, [result.placements, parties]);

  const unresolvedDemand = useMemo(() => {
    return result.unresolved.reduce((sum, item) => sum + item.party.size, 0);
  }, [result.unresolved]);

  // Handlers
  const handleToggleVehicle = (id: string) => {
    setVehicles((prev) =>
      prev.map((v) => (v.id === id ? { ...v, on: !v.on } : v))
    );
  };

  const handleUpdateVehicleSeats = (id: string, seats: number) => {
    setVehicles((prev) =>
      prev.map((v) => (v.id === id ? { ...v, seats: Math.max(0, seats) } : v))
    );
  };

  const handleUpdateVehicleDelay = (id: string, delay: number) => {
    setVehicles((prev) =>
      prev.map((v) => (v.id === id ? { ...v, delay: Math.max(0, delay) } : v))
    );
  };

  const handleToggleStopClosed = (stop: string) => {
    setClosedStops((prev) => {
      const next = new Set(prev);
      if (next.has(stop)) {
        next.delete(stop);
      } else {
        next.add(stop);
      }
      return next;
    });
  };

  const handleUpdateRuleWeight = (ruleKey: string, weight: number) => {
    setRules((prev) =>
      prev.map((r) => (r.key === ruleKey ? { ...r, weight } : r))
    );
  };

  const handlePlaceAlternative = (partyId: string, vehicleId: string, stop?: string) => {
    setManualOverrides((prev) => ({
      ...prev,
      [partyId]: { vehicleId, stop },
    }));
  };

  const handleResetScenario = () => {
    setVehicles(INITIAL_DATA.vehicles);
    setRules(DEFAULT_RULES);
    setClosedStops(new Set());
    setManualOverrides({});
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLogout = () => {
    authStore.logout();
    setCurrentUser(null);
  };

  // View Routing: Landing Page
  if (view === 'landing') {
    return (
      <LandingPage
        onEnterOperator={() => {
          setOperatorTab('overview');
          setView('operator');
        }}
        onEnterTelemetry={() => {
          setOperatorTab('telemetry');
          setView('operator');
        }}
        onEnterConflicts={() => {
          setOperatorTab('conflicts');
          setView('operator');
        }}
        onEnterPassenger={() => setView('passenger')}
        onOpenLogin={() => setView('login')}
        currentUser={currentUser}
      />
    );
  }

  // View Routing: Login Page
  if (view === 'login') {
    return (
      <LoginPage
        onSuccess={(user) => {
          setCurrentUser(user);
          setView('operator');
        }}
        onBackToHome={() => setView('landing')}
      />
    );
  }

  // View Routing: Passenger Standalone App
  if (view === 'passenger') {
    return (
      <CustomerApp
        standalone
        onBackToOperator={() => setView('operator')}
      />
    );
  }

  // View Routing: Operator Terminal Dashboard
  return (
    <div className="app-layout">
      <main className="main-column">
        {/* Top Operational Bar */}
        <div className="op-top-bar">
          <div className="op-terminal-tag">
            <span className="station-dot" />
            <span>DISRUPTION MANAGEMENT TERMINAL</span>
            <button
              type="button"
              className="op-home-link"
              onClick={() => setView('landing')}
            >
              ← LANDING
            </button>
          </div>

          <div className="op-actions">
            {currentUser ? (
              <div className="op-user-badge">
                <span className="user-icon">👤</span>
                <span className="user-name">{currentUser.name}</span>
                <button
                  type="button"
                  className="op-logout-btn"
                  onClick={handleLogout}
                  title="Sign out"
                >
                  LOGOUT
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="op-action-btn"
                onClick={() => setView('login')}
              >
                SIGN IN
              </button>
            )}

            <button
              type="button"
              className="op-action-btn"
              onClick={() => setView('passenger')}
            >
              📱 Passenger App
            </button>
          </div>
        </div>

        {/* Operator Navigation Tabs */}
        <nav className="operator-nav-tabs" aria-label="Dashboard sections">
          <button
            type="button"
            className={`op-nav-tab ${operatorTab === 'overview' ? 'active' : ''}`}
            onClick={() => setOperatorTab('overview')}
          >
            Overview & Fleet
          </button>
          <button
            type="button"
            className={`op-nav-tab ${operatorTab === 'roster' ? 'active' : ''}`}
            onClick={() => setOperatorTab('roster')}
          >
            Passenger Roster ({parties.length})
          </button>
          <button
            type="button"
            className={`op-nav-tab ${operatorTab === 'corridors' ? 'active' : ''}`}
            onClick={() => setOperatorTab('corridors')}
          >
            Corridor Demand
          </button>
          <button
            type="button"
            className={`op-nav-tab ${operatorTab === 'telemetry' ? 'active' : ''}`}
            onClick={() => setOperatorTab('telemetry')}
          >
            📡 Telemetry Ingestion (C-1)
          </button>
          <button
            type="button"
            className={`op-nav-tab ${operatorTab === 'conflicts' ? 'active' : ''}`}
            onClick={() => setOperatorTab('conflicts')}
          >
            ⚖️ Conflict Ledger (C-2)
          </button>
          <button
            type="button"
            className={`op-nav-tab ${operatorTab === 'all' ? 'active' : ''}`}
            onClick={() => setOperatorTab('all')}
          >
            Full Timetable View
          </button>
        </nav>

        {/* Tab 1: Overview & Fleet */}
        {(operatorTab === 'overview' || operatorTab === 'all') && (
          <>
            <Masthead
              unresolvedCount={result.unresolved.length}
              unresolvedDemand={unresolvedDemand}
              totalPassengers={totalPassengers}
              totalSeats={totalSeats}
              placedDemand={placedDemand}
              isOk={result.ok}
              originsCount={2}
              vehiclesRunningCount={vehicles.filter((v) => v.on).length}
              totalVehiclesCount={vehicles.length}
            />

            <Capacity
              vehicles={vehicles}
              used={result.used}
              accUsed={result.accUsed}
              closedStops={closedStops}
            />
          </>
        )}

        {/* Tab 2: Corridor Demand */}
        {(operatorTab === 'corridors' || operatorTab === 'all') && (
          <Groups
            parties={parties}
            placements={result.placements}
          />
        )}

        {/* Tab 3: Passenger Roster */}
        {(operatorTab === 'roster' || operatorTab === 'all') && (
          <Parties
            parties={parties}
            placements={result.placements}
            unresolved={result.unresolved}
            rules={rules}
            onPlaceAlternative={handlePlaceAlternative}
          />
        )}

        {/* Tab 4: Telemetry Monitor (Constraint 1) */}
        {operatorTab === 'telemetry' && (
          <TelemetryMonitor />
        )}

        {/* Tab 5: Conflict Ledger (Constraint 2) */}
        {operatorTab === 'conflicts' && (
          <ConflictLedger />
        )}
      </main>

      <Controls
        vehicles={vehicles}
        rules={rules}
        closedStops={closedStops}
        allStops={ALL_STOPS}
        decisionLog={result.log}
        theme={theme}
        isOpen={controlsOpen}
        onToggleOpen={() => setControlsOpen((prev) => !prev)}
        onToggleVehicle={handleToggleVehicle}
        onUpdateVehicleSeats={handleUpdateVehicleSeats}
        onUpdateVehicleDelay={handleUpdateVehicleDelay}
        onToggleStopClosed={handleToggleStopClosed}
        onUpdateRuleWeight={handleUpdateRuleWeight}
        onToggleTheme={handleToggleTheme}
        onResetScenario={handleResetScenario}
      />
    </div>
  );
}

export default App;
