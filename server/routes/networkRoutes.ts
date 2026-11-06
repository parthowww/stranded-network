import { Router, Request, Response } from 'express';
import { generateSeedData } from '../../src/data/seed';
import { DEFAULT_RULES } from '../../src/engine/score';
import { allocate } from '../../src/engine/allocate';
import { getSupabase, isSupabaseConfigured, localStore } from '../db/supabaseClient';
import { writeAuditLog } from './authRoutes';

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

// POST /api/network/place  — passenger accepts an alternative; persisted to Supabase audit_log + parties table
networkRouter.post('/place', async (req: Request, res: Response) => {
  try {
    const { partyId, vehicleId, stop, actor } = req.body;

    if (!partyId || !vehicleId) {
      return res.status(400).json({ error: 'partyId and vehicleId are required' });
    }

    // Update override map (affects in-memory allocation engine)
    activeOverrides[partyId] = { vehicleId, stop };

    // Update party status in local store
    const party = localStore.parties.find((p: any) => p.id === partyId);
    if (party) {
      party.status = 'PLACED';
      party.placement_vehicle_id = vehicleId;
      party.placement_stop = stop || null;
      party.updated_at = new Date().toISOString();
    }

    const vehicle = localStore.vehicles.find((v: any) => v.id === vehicleId);
    const vehicleName = vehicle?.name || vehicleId;

    const auditDetails = {
      partyId,
      vehicleId,
      vehicleName,
      stop: stop || null,
      placedAt: new Date().toISOString(),
      placedBy: actor || 'passenger-self-service',
    };

    // Write to audit_log (local + Supabase)
    await writeAuditLog('PASSENGER_PLACED', actor || partyId, auditDetails);

    // Write party update to Supabase parties table
    if (isSupabaseConfigured()) {
      try {
        await getSupabase()!
          .from('parties')
          .update({
            status: 'PLACED',
            placement_vehicle_id: vehicleId,
            placement_stop: stop || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', partyId);
      } catch (err) {
        console.warn('[Network/place] Supabase parties update failed:', err);
      }
    }

    return res.json({
      status: 'ok',
      placed: { partyId, vehicleId, vehicleName, stop },
      auditLogged: true,
      supabaseActive: isSupabaseConfigured(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Placement failed' });
  }
});

// GET /api/network/audit-log — return recent audit events for the demo dashboard
networkRouter.get('/audit-log', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    total: localStore.audit_log.length,
    events: localStore.audit_log.slice(0, 50),
  });
});
