export interface Party {
  id: string;
  label: string;
  size: number;
  origin: string;
  dest: string;
  deadline: number; // minutes from now
  wheelchair: boolean;
  vulnerable: boolean;
  confirmed: boolean;
  waitMin: number;
}

export interface Vehicle {
  id: string;
  name: string;
  from: string;
  dep: number; // departure minutes from now
  seats: number;
  accSeats: number;
  on: boolean;
  delay: number; // minutes delay
  stops: Record<string, number>; // minutes after departure for each stop
}

export interface Rule {
  key: string;
  label: string;
  description: string;
  weight: number;
  factor: (p: Party) => number; // 0..1
}

export interface RuleScoreBreakdown {
  ruleKey: string;
  label: string;
  weight: number;
  factor: number;
  points: number;
}

export interface ScoreResult {
  score: number;
  breakdown: RuleScoreBreakdown[];
}

export interface ManualOverride {
  vehicleId: string;
  stop?: string;
}

export interface Placement {
  partyId: string;
  vehicleId: string;
  vehicleName: string;
  origin: string;
  destination: string;
  arrival: number;
  isManual: boolean;
}

export interface Alternative {
  vehicleId: string;
  vehicleName: string;
  arrival: number;
  delayVsDeadline: number;
  label: string; // 'within deadline' or 'N min late'
  type: 'direct-late' | 'onward-link';
  via?: string;
  onwardMin?: number;
}

export interface UnresolvedParty {
  party: Party;
  reason: string;
  alternatives: Alternative[];
}

export interface Result {
  placements: Record<string, Placement>;
  unresolved: UnresolvedParty[];
  used: Record<string, number>;
  accUsed: Record<string, number>;
  log: string[];
  ok: boolean;
}

export interface OnwardLink {
  fromStop: string;
  toDest: string;
  durationMin: number;
}
