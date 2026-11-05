import type { Party, Rule, ScoreResult, RuleScoreBreakdown } from './types';

export const DEFAULT_RULES: Rule[] = [
  {
    key: 'wheelchair',
    label: 'Wheelchair / step-free need',
    description: 'Requires accessible vehicle allocation and step-free platforms',
    weight: 30,
    factor: (p: Party) => (p.wheelchair ? 1 : 0),
  },
  {
    key: 'vulnerable',
    label: 'Vulnerable traveller',
    description: 'Families with young children under 5, elderly, or medical needs',
    weight: 25,
    factor: (p: Party) => (p.vulnerable ? 1 : 0),
  },
  {
    key: 'deadline',
    label: 'Deadline urgency',
    description: 'Proximity of connection or critical arrival deadline',
    weight: 25,
    factor: (p: Party) => Math.max(0, 1 - p.deadline / 960),
  },
  {
    key: 'stranded',
    label: 'Time already stranded',
    description: 'Duration spent waiting at station since service cancellation',
    weight: 10,
    factor: (p: Party) => Math.min(1, p.waitMin / 180),
  },
  {
    key: 'confirmed',
    label: 'Held confirmed ticket',
    description: 'Valid pre-booked ticket held prior to service cancellation',
    weight: 10,
    factor: (p: Party) => (p.confirmed ? 1 : 0),
  },
];

export function calculateScore(party: Party, rules: Rule[] = DEFAULT_RULES): ScoreResult {
  const totalWeight = rules.reduce((sum, r) => sum + Math.max(0, r.weight), 0);

  if (totalWeight <= 0) {
    const emptyBreakdown: RuleScoreBreakdown[] = rules.map((r) => ({
      ruleKey: r.key,
      label: r.label,
      weight: r.weight,
      factor: r.factor(party),
      points: 0,
    }));
    return { score: 0, breakdown: emptyBreakdown };
  }

  const breakdown: RuleScoreBreakdown[] = rules.map((r) => {
    const rawFactor = r.factor(party);
    const clampedFactor = Math.max(0, Math.min(1, rawFactor));
    const effectiveWeight = Math.max(0, r.weight);
    const points = (100 * effectiveWeight * clampedFactor) / totalWeight;
    return {
      ruleKey: r.key,
      label: r.label,
      weight: r.weight,
      factor: clampedFactor,
      points,
    };
  });

  const rawScore = breakdown.reduce((acc, item) => acc + item.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));

  return { score, breakdown };
}
