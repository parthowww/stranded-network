import React, { useState, useEffect, useMemo } from 'react';
import { generateSeedData } from '../data/seed';
import { DEFAULT_RULES } from '../engine/score';
import { allocate, getEffectiveStops } from '../engine/allocate';
import type { Vehicle, Rule, ManualOverride } from '../engine/types';
import { syncManager, type SyncPayload } from '../sync/broadcast';
import { authStore, type UserProfile } from '../auth/authStore';
import { CustomerLogin } from './CustomerLogin';

const SEED = generateSeedData();

const ALL_ORIGINS = ['Chennai Central', 'Tambaram'];
const ALL_DESTINATIONS = [
  'Arakkonam',
  'Katpadi',
  'Vellore',
  'Salem',
  'Erode',
  'Coimbatore',
  'Madurai',
];

interface CustomerAppProps {
  onBackToOperator?: () => void;
  standalone?: boolean;
}

type CustomerViewMode = 'my-ticket' | 'search-route';

export const CustomerApp: React.FC<CustomerAppProps> = ({
  onBackToOperator,
}) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => authStore.getUser());
  const [parties] = useState(SEED.parties);
  const [selectedPartyId, setSelectedPartyId] = useState<string>('P-001');
  const [viewMode, setViewMode] = useState<CustomerViewMode>('my-ticket');

  // Route search states
  const [searchOrigin, setSearchOrigin] = useState<string>('Chennai Central');
  const [searchDest, setSearchDest] = useState<string>('Vellore');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [showNetworkInfo, setShowNetworkInfo] = useState<boolean>(false);

  // Network state synchronized with operator dashboard
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => {
    const saved = syncManager.getSavedState();
    return saved ? saved.vehicles : SEED.vehicles;
  });

  const [rules, setRules] = useState<Rule[]>(() => {
    const saved = syncManager.getSavedState();
    if (saved && saved.ruleWeights) {
      return DEFAULT_RULES.map((r) => ({
        ...r,
        weight: saved.ruleWeights[r.key] ?? r.weight,
      }));
    }
    return DEFAULT_RULES;
  });

  const [closedStops, setClosedStops] = useState<Set<string>>(() => {
    const saved = syncManager.getSavedState();
    return saved ? new Set(saved.closedStops) : new Set();
  });

  const [manualOverrides, setManualOverrides] = useState<Record<string, ManualOverride>>(() => {
    const saved = syncManager.getSavedState();
    return saved ? saved.manualOverrides : {};
  });

  const [liveConnected, setLiveConnected] = useState<boolean>(true);

  // Subscribe to real-time changes from the operator dashboard
  useEffect(() => {
    const unsubscribe = syncManager.subscribe((payload: SyncPayload) => {
      setVehicles(payload.vehicles);
      if (payload.ruleWeights) {
        setRules(
          DEFAULT_RULES.map((r) => ({
            ...r,
            weight: payload.ruleWeights[r.key] ?? r.weight,
          }))
        );
      }
      setClosedStops(new Set(payload.closedStops));
      setManualOverrides(payload.manualOverrides);
      setLiveConnected(true);
    });
    return unsubscribe;
  }, []);

  // Compute live allocation
  const result = useMemo(() => {
    return allocate({
      parties,
      vehicles,
      rules,
      closedStops,
      manualOverrides,
      onwardLinks: SEED.onwardLinks,
    });
  }, [parties, vehicles, rules, closedStops, manualOverrides]);

  const selectedParty = useMemo(() => {
    return parties.find((p) => p.id === selectedPartyId) || parties[0];
  }, [parties, selectedPartyId]);

  const placement = selectedParty ? result.placements[selectedParty.id] : undefined;
  const unresolvedInfo = selectedParty
    ? result.unresolved.find((u) => u.party.id === selectedParty.id)
    : undefined;

  // Find parties matching the route search
  const corridorParties = useMemo(() => {
    return parties.filter((p) => {
      const matchesCorridor = p.origin === searchOrigin && p.dest === searchDest;
      if (!matchesCorridor) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
      }
      return true;
    });
  }, [parties, searchOrigin, searchDest, searchQuery]);

  // Find vehicles serving this corridor
  const corridorVehicles = useMemo(() => {
    return vehicles.map((v) => {
      const effectiveStops = getEffectiveStops(v, closedStops);
      const servesDest = searchDest in effectiveStops;
      const isOrigin = v.from === searchOrigin;
      const arrival = effectiveStops[searchDest];
      const usedSeats = result.used[v.id] || 0;
      const seatsRemaining = Math.max(0, v.seats - usedSeats);

      return {
        vehicle: v,
        serves: v.on && isOrigin && servesDest,
        arrival,
        seatsRemaining,
      };
    });
  }, [vehicles, closedStops, searchOrigin, searchDest, result.used]);

  const handleAcceptAlternative = async (vehicleId: string, stop?: string) => {
    if (!selectedParty) return;

    const newOverrides = {
      ...manualOverrides,
      [selectedParty.id]: { vehicleId, stop },
    };

    setManualOverrides(newOverrides);

    // Persist to backend → Supabase audit_log + parties table
    try {
      await fetch('/api/network/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyId: selectedParty.id,
          vehicleId,
          stop: stop || null,
          actor: currentUser?.email || selectedParty.id,
        }),
      });
    } catch {
      // Non-critical — local state already updated above
    }

    const ruleWeights: Record<string, number> = {};
    for (const r of rules) {
      ruleWeights[r.key] = r.weight;
    }

    syncManager.broadcast({
      vehicles,
      ruleWeights,
      closedStops: Array.from(closedStops),
      manualOverrides: newOverrides,
      updatedAt: Date.now(),
    });
  };

  if (!currentUser) {
    return (
      <div className="customer-app-wrapper">
        <div className="customer-phone-frame">
          <CustomerLogin onSuccess={(user) => setCurrentUser(user)} />
        </div>
      </div>
    );
  }

  return (
    <div className="customer-app-wrapper">
      <div className="customer-phone-frame">
        {/* Top Header Bar */}
        <header className="customer-top-bar">
          <div className="customer-status-pill">
            <span className={`sync-dot ${liveConnected ? 'active' : ''}`} />
            <span>Station Dispatch Live</span>
          </div>

          {onBackToOperator && (
            <button
              type="button"
              className="operator-nav-back"
              onClick={onBackToOperator}
            >
              Operator View ↗
            </button>
          )}
          <button
            type="button"
            className="cust-signout-btn"
            onClick={() => { authStore.logout(); setCurrentUser(null); }}
          >
            {currentUser.name.split(' ')[0]} · SIGN OUT
          </button>
        </header>

        {/* Customer Segmented Navigation: My Ticket vs Search Route */}
        <div className="customer-mode-tabs">
          <button
            type="button"
            className={`customer-mode-btn ${viewMode === 'my-ticket' ? 'active' : ''}`}
            onClick={() => setViewMode('my-ticket')}
          >
            My Boarding Pass
          </button>
          <button
            type="button"
            className={`customer-mode-btn ${viewMode === 'search-route' ? 'active' : ''}`}
            onClick={() => setViewMode('search-route')}
          >
            🔍 Search Route & Destination
          </button>
        </div>

        {/* ========================================================
            VIEW MODE 1: MY TICKET & BOARDING PASS
           ======================================================== */}
        {viewMode === 'my-ticket' && (
          <>
            {/* Passenger Identification & Switcher */}
            <div className="customer-identity-bar">
              <div className="identity-text">
                <span className="identity-sub">Passenger Ticket Reference</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <strong>{selectedParty.label}</strong>
                  <span className="num">({selectedParty.id})</span>
                </div>
              </div>

              <div className="identity-route">
                <span>{selectedParty.origin}</span>
                <span style={{ color: 'var(--mid-grey)' }}>→</span>
                <strong>{selectedParty.dest}</strong>
              </div>
            </div>

            <main className="customer-main-content">
              {placement ? (
                /* Boarding pass */
                <div className="clean-boarding-card">
                  <div className="boarding-card-head">
                    <span className="badge-confirmed">CONFIRMED BOARDING PASS</span>
                    <span className="num badge-eta">ETA T+{placement.arrival}m</span>
                  </div>

                  <div className="boarding-card-hero">
                    <span className="hero-service-label">Your Replacement Service</span>
                    <h2 className="hero-service-title">{placement.vehicleName}</h2>
                    <div className="hero-service-route">
                      From {placement.origin} to <strong>{placement.destination}</strong>
                    </div>
                  </div>

                  <div className="boarding-card-grid">
                    <div className="card-metric">
                      <span className="metric-label">SEATS RESERVED</span>
                      <span className="metric-val num">{selectedParty.size} Pax</span>
                    </div>
                    <div className="card-metric">
                      <span className="metric-label">BOARDING ACCESS</span>
                      <span className="metric-val">
                        {selectedParty.wheelchair ? '♿ Step-Free Confirmed' : 'Standard Coach'}
                      </span>
                    </div>
                  </div>

                  <div className="boarding-instructions-box">
                    <div className="boarding-barcode">|| | |||| | ||| || |||| | || | ||| ||</div>
                    <p>
                      Please proceed to <strong>{placement.origin}</strong> bus concourse / bay.
                      Present this boarding card to the station marshal.
                    </p>
                  </div>
                </div>
              ) : (
                /* Unresolved screen with alternatives */
                <div className="clean-unresolved-card">
                  <div className="unresolved-card-head">
                    <span className="badge-pending">ALLOCATION PENDING</span>
                    <span className="num badge-queue">In Priority Queue</span>
                  </div>

                  <div className="unresolved-card-body">
                    <h3 className="unresolved-main-msg">
                      {unresolvedInfo?.reason ||
                        'All scheduled replacement vehicles for this corridor are currently operating at maximum capacity.'}
                    </h3>
                    <p className="unresolved-help-text">
                      Our system is holding your position. We have calculated the following
                      confirmed alternative journeys with verified available seats:
                    </p>

                    {unresolvedInfo && unresolvedInfo.alternatives.length > 0 ? (
                      <div className="alternatives-group">
                        <span className="alt-group-title">RECOMMENDED ALTERNATIVES</span>
                        {unresolvedInfo.alternatives.map((alt, idx) => (
                          <div key={idx} className="alt-option-card">
                            <div className="alt-option-info">
                              <strong className="alt-title">{alt.vehicleName}</strong>
                              <div className="alt-via">
                                {alt.via ? `Via ${alt.via} (+${alt.onwardMin}m connection)` : 'Direct service'}
                              </div>
                              <div className="alt-arrival num">
                                Arrives T+{alt.arrival}m ·{' '}
                                <span style={{ color: alt.delayVsDeadline <= 0 ? 'var(--signal)' : 'var(--mid-grey)' }}>
                                  {alt.label}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              className="alt-accept-button"
                              onClick={() => handleAcceptAlternative(alt.vehicleId, alt.via)}
                            >
                              Accept
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-alt-box">
                        Station dispatchers are actively routing additional coaches. You will be
                        notified automatically as soon as capacity opens.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Quick switch to search route */}
              <button
                type="button"
                className="collapsible-toggle-btn"
                style={{ textAlign: 'center', marginTop: '8px' }}
                onClick={() => setViewMode('search-route')}
              >
                🔍 Looking for a different destination or booking? Search here →
              </button>
            </main>
          </>
        )}

        {/* ========================================================
            VIEW MODE 2: SEARCH BY LOCATION & DESTINATION
           ======================================================== */}
        {viewMode === 'search-route' && (
          <div className="customer-route-search-view">
            <div className="route-search-box">
              <span className="route-box-title">Find Disrupted Route</span>

              <div className="route-select-row">
                <div className="route-select-field">
                  <label>Origin Location (Where are you?):</label>
                  <select
                    value={searchOrigin}
                    onChange={(e) => setSearchOrigin(e.target.value)}
                  >
                    {ALL_ORIGINS.map((orig) => (
                      <option key={orig} value={orig}>
                        {orig}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="route-select-field">
                  <label>Destination (Where are you going?):</label>
                  <select
                    value={searchDest}
                    onChange={(e) => setSearchDest(e.target.value)}
                  >
                    {ALL_DESTINATIONS.map((dest) => (
                      <option key={dest} value={dest}>
                        {dest}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="route-search-filter">
                <label>Filter by Passenger Name or Ref (Optional):</label>
                <input
                  type="text"
                  placeholder="e.g. Sundaram, P-001..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Results for this Origin -> Destination corridor */}
            <div className="corridor-search-results">
              <div className="results-header">
                <strong>
                  {searchOrigin} → {searchDest}
                </strong>
                <span className="num" style={{ fontSize: '11px', color: 'var(--mid-grey)' }}>
                  {corridorParties.length} Booked Parties
                </span>
              </div>

              {/* Status of replacement services on this corridor */}
              <div className="corridor-services-card">
                <span className="service-card-title">Services Serving this Corridor:</span>
                {corridorVehicles.filter((cv) => cv.serves).length > 0 ? (
                  corridorVehicles
                    .filter((cv) => cv.serves)
                    .map((cv) => (
                      <div key={cv.vehicle.id} className="corridor-service-row">
                        <div>
                          <strong>{cv.vehicle.name}</strong>
                          <div style={{ fontSize: '10px', color: 'var(--mid-grey)' }}>
                            Dep +{cv.vehicle.dep}m · Arrives {searchDest} at T+{cv.arrival}m
                          </div>
                        </div>
                        <span className="num" style={{ fontSize: '11px', fontWeight: 700 }}>
                          {cv.seatsRemaining} seats free
                        </span>
                      </div>
                    ))
                ) : (
                  <div style={{ fontSize: '11px', color: '#E53E3E', padding: '6px 0' }}>
                    ⚠ No direct service currently scheduled to {searchDest}.
                    Check recommended onward connections (e.g. Katpadi → Vellore link).
                  </div>
                )}
              </div>

              {/* Parties booked on this corridor */}
              <div className="corridor-parties-list">
                <span className="service-card-title">Booked Passengers on this Route (Tap to View):</span>
                {corridorParties.length > 0 ? (
                  corridorParties.map((p) => {
                    const isPlaced = result.placements[p.id] !== undefined;
                    const isSelected = p.id === selectedPartyId;

                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`corridor-party-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedPartyId(p.id);
                          setViewMode('my-ticket');
                        }}
                      >
                        <div>
                          <strong>{p.label}</strong>
                          <div style={{ fontSize: '10px', color: 'var(--mid-grey)' }}>
                            {p.id} · {p.size} Pax {p.wheelchair ? '· ♿ Step-Free' : ''}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span className={`status-pill ${isPlaced ? 'placed' : 'unresolved'}`}>
                            {isPlaced ? 'Placed ✓' : 'In Queue'}
                          </span>
                          <span style={{ display: 'block', fontSize: '9px', color: 'var(--signal)', marginTop: '2px' }}>
                            View Pass →
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div style={{ fontSize: '11px', color: 'var(--mid-grey)', padding: '10px', textAlign: 'center' }}>
                    No passenger parties matching this search on {searchOrigin} → {searchDest}.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Collapsible Fleet Status */}
        <div className="collapsible-section">
          <button
            type="button"
            className="collapsible-toggle-btn"
            onClick={() => setShowNetworkInfo(!showNetworkInfo)}
          >
            <span>{showNetworkInfo ? '▲ Hide' : '▼ View'} Full Station Fleet Status ({vehicles.length} vehicles)</span>
          </button>

          {showNetworkInfo && (
            <div className="collapsible-content">
              {vehicles.map((v) => {
                const isOff = !v.on;
                const u = result.used[v.id] || 0;
                return (
                  <div key={v.id} className={`fleet-line ${isOff ? 'off' : ''}`}>
                    <div className="fleet-line-main">
                      <strong>{v.name}</strong>
                      <span className="num" style={{ fontSize: '11px' }}>
                        {isOff ? 'NOT RUNNING' : `${u} / ${v.seats} seats filled`}
                      </span>
                    </div>
                    <div className="fleet-line-sub">
                      {v.from} · Dep +{v.dep}m {v.delay > 0 ? `(+${v.delay}m delay)` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Minimal Footer */}
        <footer className="customer-clean-footer">
          <span>The Stranded Network · Passenger Gateway</span>
        </footer>
      </div>
    </div>
  );
};
