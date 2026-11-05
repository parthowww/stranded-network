import { describe, it, expect } from 'vitest';
import { allocate, getEffectiveStops } from './allocate';
import type { Party, Vehicle } from './types';
import { calculateScore, DEFAULT_RULES } from './score';
import { generateSeedData } from '../data/seed';

// Simple PRNG for deterministic testing
function createRng(seed: number) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

describe('Allocation Engine', () => {
  it('truncates route at the first closed stop (that stop and later stops are unreachable)', () => {
    const v: Vehicle = {
      id: 'v1',
      name: 'Express 101',
      from: 'Chennai Central',
      dep: 30,
      seats: 50,
      accSeats: 2,
      on: true,
      delay: 15,
      stops: {
        Arakkonam: 40,
        Katpadi: 90,
        Jolarpettai: 140,
        Salem: 200,
      },
    };

    // No closed stops
    const stopsNormal = getEffectiveStops(v, new Set());
    expect(Object.keys(stopsNormal)).toEqual([
      'Arakkonam',
      'Katpadi',
      'Jolarpettai',
      'Salem',
    ]);
    expect(stopsNormal.Arakkonam).toBe(30 + 40 + 15); // 85
    expect(stopsNormal.Katpadi).toBe(30 + 90 + 15); // 135

    // Closed at Katpadi -> Katpadi, Jolarpettai, Salem are unreachable!
    const stopsClosed = getEffectiveStops(v, new Set(['Katpadi']));
    expect(Object.keys(stopsClosed)).toEqual(['Arakkonam']);
    expect(stopsClosed.Arakkonam).toBe(85);
    expect(stopsClosed.Katpadi).toBeUndefined();
    expect(stopsClosed.Salem).toBeUndefined();

    // Cancelled vehicle -> empty
    const vOff = { ...v, on: false };
    expect(getEffectiveStops(vOff, new Set())).toEqual({});
  });

  it('never splits parties across seats', () => {
    const party: Party = {
      id: 'p1',
      label: 'Family of Four',
      size: 4,
      origin: 'Chennai Central',
      dest: 'Katpadi',
      deadline: 300,
      wheelchair: false,
      vulnerable: true,
      confirmed: true,
      waitMin: 60,
    };

    // Vehicle with only 3 seats
    const v: Vehicle = {
      id: 'v1',
      name: 'Mini Coach',
      from: 'Chennai Central',
      dep: 10,
      seats: 3,
      accSeats: 1,
      on: true,
      delay: 0,
      stops: { Katpadi: 60 },
    };

    const res = allocate({
      parties: [party],
      vehicles: [v],
    });

    expect(res.placements['p1']).toBeUndefined();
    expect(res.unresolved.length).toBe(1);
    expect(res.unresolved[0].party.id).toBe('p1');
    expect(res.used['v1']).toBe(0);
    expect(res.ok).toBe(true);
  });

  it('respects accessible capacity constraint', () => {
    const p1: Party = {
      id: 'p1',
      label: 'Wheelchair User 1',
      size: 1,
      origin: 'Chennai Central',
      dest: 'Katpadi',
      deadline: 300,
      wheelchair: true,
      vulnerable: false,
      confirmed: true,
      waitMin: 30,
    };
    const p2: Party = {
      id: 'p2',
      label: 'Wheelchair User 2',
      size: 1,
      origin: 'Chennai Central',
      dest: 'Katpadi',
      deadline: 300,
      wheelchair: true,
      vulnerable: false,
      confirmed: true,
      waitMin: 10,
    };

    // Vehicle with 10 total seats but only 1 accessible seat
    const v: Vehicle = {
      id: 'v1',
      name: 'Coach with 1 Acc Space',
      from: 'Chennai Central',
      dep: 10,
      seats: 10,
      accSeats: 1,
      on: true,
      delay: 0,
      stops: { Katpadi: 60 },
    };

    const res = allocate({
      parties: [p1, p2],
      vehicles: [v],
    });

    // P1 had longer wait time, so higher tie-breaker
    expect(res.placements['p1']).toBeDefined();
    expect(res.placements['p2']).toBeUndefined();
    expect(res.accUsed['v1']).toBe(1);
    expect(res.used['v1']).toBe(1);
    expect(res.unresolved.length).toBe(1);
    expect(res.unresolved[0].reason).toBe('Seats remain but no accessible space');
    expect(res.ok).toBe(true);
  });

  it('respects capacity in manual override and rejects over-capacity manual overrides', () => {
    const p1: Party = {
      id: 'p1',
      label: 'Group A',
      size: 5,
      origin: 'Chennai Central',
      dest: 'Katpadi',
      deadline: 300,
      wheelchair: false,
      vulnerable: false,
      confirmed: true,
      waitMin: 10,
    };

    // Vehicle with 4 seats
    const v: Vehicle = {
      id: 'v1',
      name: 'Small Bus',
      from: 'Chennai Central',
      dep: 10,
      seats: 4,
      accSeats: 1,
      on: true,
      delay: 0,
      stops: { Katpadi: 60 },
    };

    // Manual override trying to place 5 seats in 4-seat bus
    const res = allocate({
      parties: [p1],
      vehicles: [v],
      manualOverrides: {
        p1: { vehicleId: 'v1' },
      },
    });

    expect(res.placements['p1']).toBeUndefined();
    expect(res.used['v1']).toBe(0);
    expect(res.ok).toBe(true);
  });

  it('guarantees identical input gives identical output (idempotency & determinism)', () => {
    const parties: Party[] = [
      {
        id: 'p2',
        label: 'Passenger B',
        size: 2,
        origin: 'Tambaram',
        dest: 'Salem',
        deadline: 400,
        wheelchair: false,
        vulnerable: true,
        confirmed: true,
        waitMin: 45,
      },
      {
        id: 'p1',
        label: 'Passenger A',
        size: 2,
        origin: 'Tambaram',
        dest: 'Salem',
        deadline: 400,
        wheelchair: false,
        vulnerable: true,
        confirmed: true,
        waitMin: 45,
      },
    ];

    const vehicles: Vehicle[] = [
      {
        id: 'v1',
        name: 'Express',
        from: 'Tambaram',
        dep: 20,
        seats: 2,
        accSeats: 1,
        on: true,
        delay: 0,
        stops: { Salem: 180 },
      },
    ];

    const run1 = allocate({ parties, vehicles });
    const run2 = allocate({ parties, vehicles });

    expect(run1).toEqual(run2);
    // Tie break on id: 'p1' comes before 'p2'
    expect(run1.placements['p1']).toBeDefined();
    expect(run1.placements['p2']).toBeUndefined();
  });

  it('does not over-allocate across 200 random seeded scenarios', () => {
    const origins = ['Chennai Central', 'Tambaram'];
    const destinations = ['Arakkonam', 'Katpadi', 'Salem', 'Erode', 'Madurai'];

    for (let i = 0; i < 200; i++) {
      const rng = createRng(42 + i * 17);

      // Generate 20-40 random parties
      const partyCount = Math.floor(rng() * 21) + 20;
      const parties: Party[] = [];
      for (let p = 0; p < partyCount; p++) {
        parties.push({
          id: `p_${i}_${p}`,
          label: `Party ${p}`,
          size: Math.floor(rng() * 4) + 1, // 1 to 4
          origin: origins[Math.floor(rng() * origins.length)],
          dest: destinations[Math.floor(rng() * destinations.length)],
          deadline: Math.floor(rng() * 660) + 300, // 300..960
          wheelchair: rng() < 0.15,
          vulnerable: rng() < 0.25,
          confirmed: rng() < 0.6,
          waitMin: Math.floor(rng() * 170) + 10,
        });
      }

      // Generate 3-6 random vehicles
      const vehicleCount = Math.floor(rng() * 4) + 3;
      const vehicles: Vehicle[] = [];
      for (let v = 0; v < vehicleCount; v++) {
        const origin = origins[Math.floor(rng() * origins.length)];
        const seats = Math.floor(rng() * 30) + 10;
        const accSeats = Math.floor(rng() * 3) + 1;
        vehicles.push({
          id: `v_${i}_${v}`,
          name: `Vehicle ${v}`,
          from: origin,
          dep: Math.floor(rng() * 60),
          seats,
          accSeats,
          on: rng() > 0.2, // 80% on
          delay: Math.floor(rng() * 45),
          stops: {
            Arakkonam: 45,
            Katpadi: 90,
            Salem: 180,
            Erode: 240,
            Madurai: 360,
          },
        });
      }

      // Random closed stop
      const closedStops = rng() < 0.3 ? [destinations[Math.floor(rng() * destinations.length)]] : [];

      const result = allocate({
        parties,
        vehicles,
        closedStops,
      });

      // Verify invariant: ok is true
      expect(result.ok).toBe(true);

      // Verify invariant: each vehicle used seats <= seats and accUsed <= accSeats
      for (const v of vehicles) {
        expect(result.used[v.id]).toBeLessThanOrEqual(v.seats);
        expect(result.accUsed[v.id]).toBeLessThanOrEqual(v.accSeats);
      }

      // Verify invariant: placed + unresolved = total parties
      const placedCount = Object.keys(result.placements).length;
      const unresolvedCount = result.unresolved.length;
      expect(placedCount + unresolvedCount).toBe(parties.length);
    }
  });

  it('correctly calculates priority score breakdown', () => {
    const party: Party = {
      id: 'p_test',
      label: 'Test Party',
      size: 2,
      origin: 'Chennai Central',
      dest: 'Katpadi',
      deadline: 480, // half of 960 -> factor 0.5
      wheelchair: true, // factor 1.0
      vulnerable: true, // factor 1.0
      confirmed: false, // factor 0
      waitMin: 90, // half of 180 -> factor 0.5
    };

    const res = calculateScore(party, DEFAULT_RULES);
    // Weights: 30, 25, 25, 10, 10 (sum = 100)
    // Points:
    // wheelchair: 30 * 1 = 30
    // vulnerable: 25 * 1 = 25
    // deadline: 25 * 0.5 = 12.5
    // stranded: 10 * 0.5 = 5
    // confirmed: 10 * 0 = 0
    // Total = 72.5
    expect(res.score).toBe(72.5);
    expect(res.breakdown.find((b) => b.ruleKey === 'wheelchair')?.points).toBe(30);
    expect(res.breakdown.find((b) => b.ruleKey === 'vulnerable')?.points).toBe(25);
    expect(res.breakdown.find((b) => b.ruleKey === 'deadline')?.points).toBe(12.5);
    expect(res.breakdown.find((b) => b.ruleKey === 'stranded')?.points).toBe(5);
    expect(res.breakdown.find((b) => b.ruleKey === 'confirmed')?.points).toBe(0);
  });

  it('verifies seed data meets all specification requirements', () => {
    const { parties, vehicles, onwardLinks } = generateSeedData();

    expect(parties.length).toBe(58);
    expect(vehicles.length).toBe(5);
    expect(onwardLinks.length).toBeGreaterThanOrEqual(2);

    const totalDemand = parties.reduce((sum, p) => sum + p.size, 0);
    const totalSeats = vehicles.reduce((sum, v) => sum + v.seats, 0);

    // Total seats below demand
    expect(totalSeats).toBeLessThan(totalDemand);

    // Wheelchair ~7% (between 3% and 15%)
    const wheelchairCount = parties.filter((p) => p.wheelchair).length;
    expect(wheelchairCount / parties.length).toBeGreaterThan(0.03);
    expect(wheelchairCount / parties.length).toBeLessThan(0.15);

    // Vulnerable ~22% (between 15% and 35%)
    const vulnerableCount = parties.filter((p) => p.vulnerable).length;
    expect(vulnerableCount / parties.length).toBeGreaterThan(0.15);
    expect(vulnerableCount / parties.length).toBeLessThan(0.35);

    // Confirmed ~60% (between 50% and 75%)
    const confirmedCount = parties.filter((p) => p.confirmed).length;
    expect(confirmedCount / parties.length).toBeGreaterThan(0.5);
    expect(confirmedCount / parties.length).toBeLessThan(0.75);

    // Initial allocation produces some unresolved parties
    const result = allocate({ parties, vehicles, onwardLinks });
    expect(result.ok).toBe(true);
    expect(result.unresolved.length).toBeGreaterThan(0);
    expect(Object.keys(result.placements).length).toBeGreaterThan(0);
  });
});
