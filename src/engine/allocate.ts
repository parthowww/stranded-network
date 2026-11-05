import type {
  Party,
  Vehicle,
  Rule,
  Result,
  Placement,
  UnresolvedParty,
  Alternative,
  ManualOverride,
  OnwardLink,
} from './types';
import { calculateScore, DEFAULT_RULES } from './score';

export interface AllocateOptions {
  parties: Party[];
  vehicles: Vehicle[];
  rules?: Rule[];
  closedStops?: Set<string> | string[];
  manualOverrides?: Record<string, ManualOverride>;
  onwardLinks?: OnwardLink[];
}

export const DEFAULT_ONWARD_LINKS: OnwardLink[] = [
  { fromStop: 'Katpadi', toDest: 'Vellore', durationMin: 45 },
  { fromStop: 'Arakkonam', toDest: 'Katpadi', durationMin: 40 },
  { fromStop: 'Salem', toDest: 'Erode', durationMin: 50 },
  { fromStop: 'Erode', toDest: 'Coimbatore', durationMin: 65 },
  { fromStop: 'Salem', toDest: 'Madurai', durationMin: 130 },
];

/**
 * Calculates effective stops and arrival times for a vehicle.
 * Stops are empty if vehicle is cancelled (on === false).
 * Truncates route at the first closed stop (that stop and later stops are unreachable).
 */
export function getEffectiveStops(
  vehicle: Vehicle,
  closedStopsSet: Set<string>
): Record<string, number> {
  if (!vehicle.on) {
    return {};
  }

  const effective: Record<string, number> = {};
  const entries = Object.entries(vehicle.stops);

  for (const [stop, offset] of entries) {
    if (closedStopsSet.has(stop)) {
      // Route is truncated at the first closed stop
      break;
    }
    effective[stop] = vehicle.dep + offset + vehicle.delay;
  }

  return effective;
}

export function allocate(options: AllocateOptions): Result {
  const {
    parties,
    vehicles,
    rules = DEFAULT_RULES,
    closedStops = new Set<string>(),
    manualOverrides = {},
    onwardLinks = DEFAULT_ONWARD_LINKS,
  } = options;

  const closedSet = closedStops instanceof Set ? closedStops : new Set(closedStops);
  const log: string[] = [];

  // Pre-calculate effective stops for all vehicles
  const vehicleStopsMap = new Map<string, Record<string, number>>();
  const vehiclesMap = new Map<string, Vehicle>();
  const used: Record<string, number> = {};
  const accUsed: Record<string, number> = {};

  for (const v of vehicles) {
    vehiclesMap.set(v.id, v);
    vehicleStopsMap.set(v.id, getEffectiveStops(v, closedSet));
    used[v.id] = 0;
    accUsed[v.id] = 0;
  }

  const placements: Record<string, Placement> = {};
  const placedPartyIds = new Set<string>();

  // 1. Manual Overrides are applied first, capacity-checked, and logged as manual.
  for (const party of parties) {
    const override = manualOverrides[party.id];
    if (!override) continue;

    const v = vehiclesMap.get(override.vehicleId);
    if (!v) {
      log.push(`[Manual skipped] Target vehicle ${override.vehicleId} not found for Party ${party.id}.`);
      continue;
    }

    const effectiveStops = vehicleStopsMap.get(v.id) || {};
    const dest = override.stop || party.dest;
    const arrival = effectiveStops[dest];

    // Capacity check
    const fitsSeats = used[v.id] + party.size <= v.seats;
    const fitsAcc = !party.wheelchair || accUsed[v.id] + 1 <= v.accSeats;
    const canReach = arrival !== undefined;

    if (v.on && canReach && fitsSeats && fitsAcc) {
      used[v.id] += party.size;
      if (party.wheelchair) {
        accUsed[v.id] += 1;
      }
      placements[party.id] = {
        partyId: party.id,
        vehicleId: v.id,
        vehicleName: v.name,
        origin: party.origin,
        destination: dest,
        arrival,
        isManual: true,
      };
      placedPartyIds.add(party.id);
      log.push(
        `[Manual override] Placed Party ${party.id} (${party.label}, size ${party.size}) on ${v.name} to ${dest} (arrival T+${arrival}m).`
      );
    } else {
      log.push(
        `[Manual override denied] Party ${party.id} manual placement on ${v.name} rejected (capacity or stop reached).`
      );
    }
  }

  // 2. Sort unplaced parties by score descending; ties break by longer wait, then lower id.
  const scoredParties = parties
    .filter((p) => !placedPartyIds.has(p.id))
    .map((p) => {
      const scoreResult = calculateScore(p, rules);
      return {
        party: p,
        score: scoreResult.score,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.party.waitMin !== a.party.waitMin) {
        return b.party.waitMin - a.party.waitMin;
      }
      return a.party.id.localeCompare(b.party.id);
    });

  const unresolved: UnresolvedParty[] = [];

  // 3. Auto-allocate
  for (const { party } of scoredParties) {
    // Find qualifying vehicles:
    // departs from party's origin, serves destination, used + size <= seats,
    // has free accessible space if needed, arrives by deadline.
    interface QualifyingCandidate {
      vehicle: Vehicle;
      arrival: number;
    }

    const qualifying: QualifyingCandidate[] = [];

    for (const v of vehicles) {
      if (!v.on) continue;
      if (v.from !== party.origin) continue;

      const effectiveStops = vehicleStopsMap.get(v.id) || {};
      const arrival = effectiveStops[party.dest];
      if (arrival === undefined) continue;

      if (used[v.id] + party.size > v.seats) continue;
      if (party.wheelchair && accUsed[v.id] + 1 > v.accSeats) continue;
      if (arrival > party.deadline) continue;

      qualifying.push({ vehicle: v, arrival });
    }

    if (qualifying.length > 0) {
      // 4. Choose earliest-arriving qualifying vehicle; tie-break by lower vehicle id
      qualifying.sort((a, b) => {
        if (a.arrival !== b.arrival) {
          return a.arrival - b.arrival;
        }
        return a.vehicle.id.localeCompare(b.vehicle.id);
      });

      const chosen = qualifying[0];
      used[chosen.vehicle.id] += party.size;
      if (party.wheelchair) {
        accUsed[chosen.vehicle.id] += 1;
      }

      placements[party.id] = {
        partyId: party.id,
        vehicleId: chosen.vehicle.id,
        vehicleName: chosen.vehicle.name,
        origin: party.origin,
        destination: party.dest,
        arrival: chosen.arrival,
        isManual: false,
      };
      placedPartyIds.add(party.id);

      log.push(
        `Allocated Party ${party.id} (${party.label}, size ${party.size}) to ${chosen.vehicle.name} arriving at ${party.dest} at T+${chosen.arrival}m (deadline T+${party.deadline}m).`
      );
    } else {
      // 6. Unresolved reason hierarchy
      let reason = '';
      const servingVehicles = vehicles.filter((v) => {
        if (!v.on || v.from !== party.origin) return false;
        const effectiveStops = vehicleStopsMap.get(v.id) || {};
        return party.dest in effectiveStops;
      });

      if (servingVehicles.length === 0) {
        reason = 'No active vehicle serves this route';
      } else {
        const vehiclesWithSeats = servingVehicles.filter(
          (v) => v.seats - used[v.id] >= party.size
        );

        if (vehiclesWithSeats.length === 0) {
          reason = 'Every serving vehicle is full';
        } else {
          const vehiclesWithAcc = vehiclesWithSeats.filter(
            (v) => !party.wheelchair || v.accSeats - accUsed[v.id] >= 1
          );

          if (party.wheelchair && vehiclesWithAcc.length === 0) {
            reason = 'Seats remain but no accessible space';
          } else {
            // Free seats exist but arrival is after deadline
            const eligibleVehicles = party.wheelchair ? vehiclesWithAcc : vehiclesWithSeats;
            const earliestArrival = Math.min(
              ...eligibleVehicles.map((v) => vehicleStopsMap.get(v.id)![party.dest])
            );
            const lateMin = earliestArrival - party.deadline;
            reason = `Earliest free seat arrives ${lateMin} minutes after the deadline`;
          }
        }
      }

      // 7. Alternatives computed against final remaining capacity
      // (will be populated or finalized after all allocations)
      unresolved.push({
        party,
        reason,
        alternatives: [],
      });

      log.push(
        `Unresolved Party ${party.id} (${party.label}, size ${party.size}) to ${party.dest}: ${reason}.`
      );
    }
  }

  // 7. Calculate alternatives for unresolved parties against remaining vehicle capacities
  for (const item of unresolved) {
    const p = item.party;
    const alts: Alternative[] = [];
    const seen = new Set<string>();

    for (const v of vehicles) {
      if (!v.on || v.from !== p.origin) continue;
      const seatsFree = v.seats - used[v.id];
      if (seatsFree < p.size) continue;
      if (p.wheelchair && v.accSeats - accUsed[v.id] < 1) continue;

      const effectiveStops = vehicleStopsMap.get(v.id) || {};

      // (a) Direct seat arriving late (or on time if missed due to other constraints)
      if (p.dest in effectiveStops) {
        const arrival = effectiveStops[p.dest];
        const delayVsDeadline = arrival - p.deadline;
        const key = `${v.id}-direct-${arrival}`;
        if (!seen.has(key)) {
          seen.add(key);
          alts.push({
            vehicleId: v.id,
            vehicleName: v.name,
            arrival,
            delayVsDeadline,
            label: delayVsDeadline <= 0 ? 'within deadline' : `${delayVsDeadline} min late`,
            type: 'direct-late',
          });
        }
      }

      // (b) Seat to a nearby stop plus an onward link
      for (const link of onwardLinks) {
        if (link.toDest === p.dest && link.fromStop in effectiveStops) {
          const legArrival = effectiveStops[link.fromStop];
          const totalArrival = legArrival + link.durationMin;
          const delayVsDeadline = totalArrival - p.deadline;
          const key = `${v.id}-via-${link.fromStop}-${totalArrival}`;
          if (!seen.has(key)) {
            seen.add(key);
            alts.push({
              vehicleId: v.id,
              vehicleName: v.name,
              via: link.fromStop,
              arrival: totalArrival,
              delayVsDeadline,
              label: delayVsDeadline <= 0 ? 'within deadline' : `${delayVsDeadline} min late`,
              type: 'onward-link',
              onwardMin: link.durationMin,
            });
          }
        }
      }
    }

    // Sort by arrival ascending, keep top 3
    alts.sort((a, b) => {
      if (a.arrival !== b.arrival) return a.arrival - b.arrival;
      return a.vehicleName.localeCompare(b.vehicleName);
    });

    item.alternatives = alts.slice(0, 3);
  }

  // 8. ok = no vehicle's placed party sizes exceed its seats and accessible use never exceeds accSeats
  const ok = vehicles.every(
    (v) => (used[v.id] || 0) <= v.seats && (accUsed[v.id] || 0) <= v.accSeats
  );

  return {
    placements,
    unresolved,
    used,
    accUsed,
    log,
    ok,
  };
}
