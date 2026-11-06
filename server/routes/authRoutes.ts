import { Router, Request, Response } from 'express';
import { getSupabase, isSupabaseConfigured, localStore } from '../db/supabaseClient';

export const authRouter = Router();

// Demo users with roles
const DEMO_ACCOUNTS = [
  {
    email: 'operator@stranded.net',
    name: 'Chief Dispatcher V. Raman',
    role: 'operator',
    roleLabel: 'Station Operations Chief',
    department: 'Disruption & Allocation Command',
    color: '#2563eb'
  },
  {
    email: 'telemetry@stranded.net',
    name: 'Dr. S. Rao (Signals Lead)',
    role: 'dispatcher',
    roleLabel: 'Telemetry & SCADA Dispatcher',
    department: 'Signal, Track & Ingestion Systems',
    color: '#059669'
  },
  {
    email: 'auditor@stranded.net',
    name: 'Inspector M. Chen',
    role: 'auditor',
    roleLabel: 'Safety & Arbitration Auditor',
    department: 'Independent Rail Safety Directorate',
    color: '#d97706'
  },
  {
    email: 'passenger@stranded.net',
    name: 'Parthasarathi Adhikary',
    role: 'passenger',
    roleLabel: 'Stranded Traveller (Party P-07)',
    department: 'Passenger Self-Service Portal',
    color: '#7c3aed'
  }
];

// In-memory active tokens
const activeSessions = new Map<string, any>();

// Seed default tokens
for (const acc of DEMO_ACCOUNTS) {
  const token = `token-${acc.role}-${Buffer.from(acc.email).toString('base64')}`;
  activeSessions.set(token, acc);
}

// GET /api/auth/demo-users
authRouter.get('/demo-users', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    demoUsers: DEMO_ACCOUNTS,
  });
});

// POST /api/auth/login
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, role } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // 1. Check if it's one of our pre-configured accounts
    const matchedAccount = DEMO_ACCOUNTS.find(
      acc => acc.email.toLowerCase() === email.toLowerCase()
    );

    let userProfile = matchedAccount;

    // 2. If Supabase is connected, attempt Supabase Auth or DB lookup
    if (isSupabaseConfigured()) {
      const supabase = getSupabase()!;
      const { data: dbUser } = await supabase
        .from('users_profile')
        .select('*')
        .eq('email', email)
        .single();

      if (dbUser) {
        userProfile = {
          email: dbUser.email,
          name: dbUser.full_name,
          role: dbUser.role,
          roleLabel: dbUser.role.toUpperCase(),
          department: dbUser.department || 'Operations',
          color: dbUser.avatar_color || '#2563eb'
        };
      }
    }

    // If not found in demo accounts or DB, generate dynamic profile
    if (!userProfile) {
      userProfile = {
        email: email,
        name: email.split('@')[0].replace(/[._]/g, ' '),
        role: role || 'operator',
        roleLabel: (role || 'operator').toUpperCase(),
        department: 'Operations',
        color: '#2563eb'
      };

      // Save to local store
      localStore.users_profile.push({
        id: `usr-${Date.now()}`,
        email: userProfile.email,
        full_name: userProfile.name,
        role: userProfile.role,
        department: userProfile.department,
        created_at: new Date().toISOString()
      });
    }

    const sessionToken = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    activeSessions.set(sessionToken, userProfile);

    // Record login in audit log
    localStore.audit_log.unshift({
      id: `audit-${Date.now()}`,
      event_type: 'USER_LOGIN',
      actor: userProfile.email,
      details: { role: userProfile.role, timestamp: new Date().toISOString() },
      created_at: new Date().toISOString()
    });

    return res.json({
      status: 'ok',
      token: sessionToken,
      user: userProfile,
      isSupabaseActive: isSupabaseConfigured()
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal login error' });
  }
});

// POST /api/auth/register
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, name, role, department } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'Email and full name are required' });
    }

    const newUser = {
      id: `usr-${Date.now()}`,
      email,
      full_name: name,
      role: role || 'operator',
      department: department || 'Operations',
      created_at: new Date().toISOString()
    };

    if (isSupabaseConfigured()) {
      const supabase = getSupabase()!;
      await supabase.from('users_profile').insert(newUser);
    } else {
      localStore.users_profile.push(newUser);
    }

    const sessionToken = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const userProfile = {
      email: newUser.email,
      name: newUser.full_name,
      role: newUser.role,
      roleLabel: newUser.role.toUpperCase(),
      department: newUser.department,
      color: '#2563eb'
    };
    activeSessions.set(sessionToken, userProfile);

    return res.status(201).json({
      status: 'ok',
      token: sessionToken,
      user: userProfile
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// GET /api/auth/me
authRouter.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized or session expired' });
  }

  const user = activeSessions.get(token);
  return res.json({
    status: 'ok',
    user,
    isSupabaseActive: isSupabaseConfigured()
  });
});

// POST /api/auth/logout
authRouter.post('/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  if (token) {
    activeSessions.delete(token);
  }
  return res.json({ status: 'ok', message: 'Logged out successfully' });
});
