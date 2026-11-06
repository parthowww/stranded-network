import { Router, Request, Response } from 'express';
import { generateSeedData } from '../../src/data/seed';
import { DEFAULT_RULES } from '../../src/engine/score';
import { allocate } from '../../src/engine/allocate';
import { localStore } from '../db/supabaseClient';

export const networkRouter = Router();

const initialSeed = generateSeedData();

// Seed local store
if (localStore.parties.length === 0) {
  localStore.parties = [...initialSeed.parties];
}
if (localStore.vehicles.length === 0) {
  localStore.vehicles = [...initialSeed.vehicles];
}

let activeRules = [...DEFAULT_RULES];
let activeClosedStops = new Set<string>();
let activeOverrides: Record<string, { vehicleId: string; stop?: string }> = {};

// GET /api/network/state
networkRouter.get('/state', (_req: Request, res: Response) => {
  const allocation = allocate({
    parties: localStore.parties,
    vehicles: localStore.vehicles,
    rules: activeRules,
    closedStops: activeClosedStops,
    manualOverrides: activeOverrides,
    onwardLinks: initialSeed.onwardLinks,
  });

  res.json({
    status: 'ok',
    parties: localStore.parties,
    vehicles: localStore.vehicles,
    rules: activeRules,
    closedStops: Array.from(activeClosedStops),
    manualOverrides: activeOverrides,
    allocationSummary: {
      totalParties: localStore.parties.length,
      placedCount: Object.keys(allocation.placements).length,
      unresolvedCount: allocation.unresolved.length,
      isCapacityOk: allocation.ok
    }
  });
});

// POST /api/network/toggle-vehicle
networkRouter.post('/toggle-vehicle', (req: Request, res: Response) => {
  const { id } = req.body;
  const vehicle = localStore.vehicles.find(v => v.id === id);
  if (vehicle) {
    vehicle.on = !vehicle.on;
  }
  res.json({ status: 'ok', vehicles: localStore.vehicles });
});

// POST /api/network/toggle-stop
networkRouter.post('/toggle-stop', (req: Request, res: Response) => {
  const { stop } = req.body;
  if (activeClosedStops.has(stop)) {
    activeClosedStops.delete(stop);
  } else {
    activeClosedStops.add(stop);
  }
  res.json({ status: 'ok', closedStops: Array.from(activeClosedStops) });
});
