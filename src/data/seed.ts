import type { Party, Vehicle, OnwardLink } from '../engine/types';

// Mulberry32 seeded PRNG
function createPrng(seed: number) {
  let s = seed;
  return function () {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_NAMES = [
  'K. Sundaram',
  'Dr. A. Raman',
  'Meenakshi & mother',
  'Kavitha & infant',
  'Senior pilgrim group',
  'S. Anand & family',
  'R. Balaji',
  'P. Selvam',
  'Revathi & sister',
  'M. Murugan',
  'Radha & grandfather',
  'K. Vignesh',
  'Deepa & twins',
  'V. Natarajan',
  'S. Chandrasekar',
  'Lakshmi Narayanan',
  'J. Jennifer',
  'G. Srinivasan',
  'Anitha & toddler',
  'T. Rajendran',
  'Padma & father',
  'C. Karthik',
  'Shalini & family',
  'N. Suresh Kumar',
  'B. Gomathi',
  'K. Vijayalakshmi',
  'R. Harish',
  'M. Dhandapani',
  'S. Subbulakshmi',
  'V. Prabhakaran',
  'Gayathri & baby',
  'A. Mohammed Ismail',
  'S. Geetha & aunt',
  'N. Venkatraman',
  'P. Saravanan',
  'S. Banumathi',
  'E. Joseph & family',
  'D. Senthil',
  'K. Thilagavathi',
  'V. Kumaraswamy',
  'R. Priyadarshini',
  'M. Alagappan',
  'S. Manickam',
  'T. Vasantha',
  'K. Logeshwaran',
  'B. Usha',
  'S. Sivakumar',
  'A. Jayanthi & child',
  'N. Ramakrishnan',
  'C. Malathi',
  'G. Soundararajan',
  'V. Shenbagam',
  'R. Devarajan',
  'M. Kasinathan',
  'S. Jayachandran',
  'K. Porkodi',
  'P. Arumugam',
  'T. Krishnaveni',
];

export const ONWARD_LINKS: OnwardLink[] = [
  { fromStop: 'Katpadi', toDest: 'Vellore', durationMin: 45 },
  { fromStop: 'Arakkonam', toDest: 'Katpadi', durationMin: 40 },
  { fromStop: 'Salem', toDest: 'Erode', durationMin: 50 },
  { fromStop: 'Erode', toDest: 'Coimbatore', durationMin: 65 },
  { fromStop: 'Salem', toDest: 'Madurai', durationMin: 130 },
];

export function generateSeedData(): {
  parties: Party[];
  vehicles: Vehicle[];
  onwardLinks: OnwardLink[];
} {
  const rng = createPrng(19840912);

  const origins = ['Chennai Central', 'Tambaram'];
  // Notice: Vellore does not have direct train track from central in our fleet,
  // passengers bound for Vellore rely on Katpadi + onward link!
  const destinations = [
    'Arakkonam',
    'Katpadi',
    'Vellore',
    'Salem',
    'Erode',
    'Coimbatore',
    'Madurai',
  ];

  const parties: Party[] = [];
  const targetCount = 58;

  // We want approximately:
  // ~7% wheelchair (approx 4)
  // ~22% vulnerable (approx 13)
  // ~60% confirmed (approx 35)
  // waitMin: 10 - 180 min
  // deadline: 300 - 960 min
  // sizes: 1 - 4

  for (let i = 0; i < targetCount; i++) {
    const id = `P-${String(i + 1).padStart(3, '0')}`;
    const name = SAMPLE_NAMES[i % SAMPLE_NAMES.length];

    // party size distribution: 1 (45%), 2 (30%), 3 (15%), 4 (10%)
    const sRand = rng();
    const size = sRand < 0.45 ? 1 : sRand < 0.75 ? 2 : sRand < 0.9 ? 3 : 4;

    // Origin: roughly 60% Chennai Central, 40% Tambaram
    const origin = rng() < 0.6 ? origins[0] : origins[1];

    // Destination:
    const dest = destinations[Math.floor(rng() * destinations.length)];

    // Target ~7% wheelchair
    const wheelchair = rng() < 0.075;

    // Target ~22% vulnerable (higher if wheelchair or family)
    const vulnerable = wheelchair || rng() < 0.22;

    // Target ~60% confirmed ticket holders
    const confirmed = rng() < 0.6;

    // Wait 10 to 180 min
    const waitMin = Math.round(10 + rng() * 170);

    // Deadline 300 to 960 min
    const deadline = Math.round(300 + rng() * 660);

    const label = size > 1 && !name.includes('&') && !name.includes('group') && !name.includes('family')
      ? `${name} +${size - 1}`
      : name;

    parties.push({
      id,
      label,
      size,
      origin,
      dest,
      deadline,
      wheelchair,
      vulnerable,
      confirmed,
      waitMin,
    });
  }

  // 5 replacement vehicles with total seats below demand:
  // Demand = sum of party sizes (~120-130 passengers).
  // Total vehicle seats = 26 + 18 + 22 + 16 + 14 = 96 seats.
  // Vehicles:
  // 1. Special Train 0601 (Coach Special)
  // 2. West Coast Relief Coach A
  // 3. Southern Night Express
  // 4. Kongu Corridor Coach B
  // 5. Tambaram Express Shuttle
  const vehicles: Vehicle[] = [
    {
      id: 'V-01',
      name: 'Special Train 0601',
      from: 'Chennai Central',
      dep: 25,
      seats: 26,
      accSeats: 2,
      on: true,
      delay: 0,
      stops: {
        Arakkonam: 45,
        Katpadi: 90,
      },
    },
    {
      id: 'V-02',
      name: 'West Coast Relief Coach A',
      from: 'Chennai Central',
      dep: 50,
      seats: 18,
      accSeats: 1,
      on: true,
      delay: 15,
      stops: {
        Arakkonam: 55,
        Katpadi: 105,
        Salem: 220,
        Erode: 280,
      },
    },
    {
      id: 'V-03',
      name: 'Southern Night Express',
      from: 'Tambaram',
      dep: 40,
      seats: 22,
      accSeats: 2,
      on: true,
      delay: 0,
      stops: {
        Salem: 195,
        Erode: 255,
        Madurai: 350,
      },
    },
    {
      id: 'V-04',
      name: 'Kongu Corridor Coach B',
      from: 'Chennai Central',
      dep: 80,
      seats: 16,
      accSeats: 1,
      on: true,
      delay: 20,
      stops: {
        Katpadi: 110,
        Salem: 230,
        Erode: 295,
        Coimbatore: 375,
      },
    },
    {
      id: 'V-05',
      name: 'Tambaram Express Shuttle',
      from: 'Tambaram',
      dep: 35,
      seats: 14,
      accSeats: 1,
      on: true,
      delay: 5,
      stops: {
        Arakkonam: 65,
        Katpadi: 120,
        Salem: 240,
      },
    },
  ];

  return {
    parties,
    vehicles,
    onwardLinks: ONWARD_LINKS,
  };
}
