import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRouter } from './routes/authRoutes';
import { telemetryRouter } from './routes/telemetryRoutes';
import { conflictRouter } from './routes/conflictRoutes';
import { networkRouter } from './routes/networkRoutes';
import { isSupabaseConfigured } from './db/supabaseClient';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/telemetry', telemetryRouter);
app.use('/api/conflicts', conflictRouter);
app.use('/api/network', networkRouter);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    service: 'The Stranded Network Backend',
    version: '2.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    supabaseConnected: isSupabaseConfigured(),
    constraintsActive: {
      constraint1: 'Telemetry Anomaly Filter (Z-Score, Stuck, Jitter, Out-of-Order, Fusion)',
      constraint2: 'Truth Arbitration Engine (Anti-LWW, Staleness Decay, Physical Witness, Quarantine)'
    },
    timestamp: new Date().toISOString()
  });
});

export const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  THE STRANDED NETWORK — BACKEND ENGINE ACTIVE`);
  console.log(`  Port: ${PORT} | Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Supabase Connected: ${isSupabaseConfigured()}`);
  console.log(`  Constraint 1: Unreliable Telemetry Pipeline Loaded`);
  console.log(`  Constraint 2: Anti-LWW Truth Arbitration Engine Loaded`);
  console.log(`=======================================================`);
});

export default app;
