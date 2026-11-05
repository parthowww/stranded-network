import React, { useState, useMemo } from 'react';
import type { Party, Placement, UnresolvedParty, Rule } from '../engine/types';
import { Ledger } from './Ledger';

interface PartiesProps {
  parties: Party[];
  placements: Record<string, Placement>;
  unresolved: UnresolvedParty[];
  rules: Rule[];
  onPlaceAlternative: (partyId: string, vehicleId: string, stop?: string) => void;
}

type FilterType = 'all' | 'unresolved' | 'placed' | 'accessible';

export const Parties: React.FC<PartiesProps> = ({
  parties,
  placements,
  unresolved,
  rules,
  onPlaceAlternative,
}) => {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [selectedOrigin, setSelectedOrigin] = useState<string>('all');
  const [selectedDest, setSelectedDest] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Extract unique origins and destinations
  const origins = useMemo(() => {
    return Array.from(new Set(parties.map((p) => p.origin))).sort();
  }, [parties]);

  const destinations = useMemo(() => {
    return Array.from(new Set(parties.map((p) => p.dest))).sort();
  }, [parties]);

  const unresolvedMap = useMemo(() => {
    const map = new Map<string, UnresolvedParty>();
    for (const u of unresolved) {
      map.set(u.party.id, u);
    }
    return map;
  }, [unresolved]);

  const filteredParties = useMemo(() => {
    return parties.filter((p) => {
      const isPlaced = placements[p.id] !== undefined;

      if (filter === 'unresolved' && isPlaced) return false;
      if (filter === 'placed' && !isPlaced) return false;
      if (filter === 'accessible' && !p.wheelchair) return false;

      if (selectedOrigin !== 'all' && p.origin !== selectedOrigin) {
        return false;
      }

      if (selectedDest !== 'all' && p.dest !== selectedDest) {
        return false;
      }

      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = p.label.toLowerCase().includes(query);
        const matchesDest = p.dest.toLowerCase().includes(query);
        const matchesOrigin = p.origin.toLowerCase().includes(query);
        const matchesId = p.id.toLowerCase().includes(query);
        if (!matchesName && !matchesDest && !matchesOrigin && !matchesId) {
          return false;
        }
      }

      return true;
    });
  }, [parties, placements, filter, selectedOrigin, selectedDest, search]);

  const handleToggleExpand = (partyId: string) => {
    setExpandedId((prev) => (prev === partyId ? null : partyId));
  };

  const hasActiveFilters =
    filter !== 'all' || selectedOrigin !== 'all' || selectedDest !== 'all' || search.trim() !== '';

  const handleResetFilters = () => {
    setFilter('all');
    setSelectedOrigin('all');
    setSelectedDest('all');
    setSearch('');
  };

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Passenger Roster</h2>
          <span style={{ fontSize: '11px', color: 'var(--mid-grey)', fontFamily: 'var(--font-mono)' }}>
            Search & filter by corridor location, destination, or passenger
          </span>
        </div>
        <span className="num" style={{ fontSize: 'var(--text-xs)', color: 'var(--mid-grey)' }}>
          Showing {filteredParties.length} of {parties.length}
        </span>
      </div>

      {/* Origin & Destination Search Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-3)',
          padding: 'var(--space-3)',
          background: 'rgba(0, 0, 0, 0.02)',
          border: '1px solid var(--rule)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <label style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--mid-grey)', textTransform: 'uppercase' }}>
            Origin Location:
          </label>
          <select
            value={selectedOrigin}
            onChange={(e) => setSelectedOrigin(e.target.value)}
            style={{
              background: 'var(--paper)',
              border: '1px solid var(--rule)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              padding: '6px 8px',
              fontWeight: selectedOrigin !== 'all' ? 700 : 400,
            }}
          >
            <option value="all">All Origins (Chennai & Tambaram)</option>
            {origins.map((orig) => (
              <option key={orig} value={orig}>
                {orig}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <label style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--mid-grey)', textTransform: 'uppercase' }}>
            Destination:
          </label>
          <select
            value={selectedDest}
            onChange={(e) => setSelectedDest(e.target.value)}
            style={{
              background: 'var(--paper)',
              border: '1px solid var(--rule)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              padding: '6px 8px',
              fontWeight: selectedDest !== 'all' ? 700 : 400,
            }}
          >
            <option value="all">All Destinations ({destinations.length} Stations)</option>
            {destinations.map((dest) => (
              <option key={dest} value={dest}>
                {dest}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <label style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--mid-grey)', textTransform: 'uppercase' }}>
            Search Passenger Name or Ticket:
          </label>
          <input
            type="text"
            placeholder="e.g. Sundaram, P-001..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: 'var(--paper)',
              border: '1px solid var(--rule)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              padding: '6px 8px',
            }}
          />
        </div>
      </div>

      {/* Status category filters and quick reset */}
      <div className="ledger-controls">
        <button
          type="button"
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Statuses ({parties.length})
        </button>
        <button
          type="button"
          className={`filter-btn ${filter === 'unresolved' ? 'active' : ''}`}
          onClick={() => setFilter('unresolved')}
        >
          Unresolved ({unresolved.length})
        </button>
        <button
          type="button"
          className={`filter-btn ${filter === 'placed' ? 'active' : ''}`}
          onClick={() => setFilter('placed')}
        >
          Placed ({Object.keys(placements).length})
        </button>
        <button
          type="button"
          className={`filter-btn ${filter === 'accessible' ? 'active' : ''}`}
          onClick={() => setFilter('accessible')}
        >
          Step-free need ({parties.filter((p) => p.wheelchair).length})
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            className="filter-btn"
            onClick={handleResetFilters}
            style={{ marginLeft: 'auto', color: 'var(--signal)', borderColor: 'var(--signal)' }}
          >
            ✕ Reset Filters
          </button>
        )}
      </div>

      <Ledger
        parties={filteredParties}
        placements={placements}
        unresolvedMap={unresolvedMap}
        rules={rules}
        expandedId={expandedId}
        onToggleExpand={handleToggleExpand}
        onPlaceAlternative={onPlaceAlternative}
      />
    </section>
  );
};
