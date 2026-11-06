# Technical Solution: Telemetry Quality Engine & Non-Trivial Truth Arbitration

> Architectural documentation and mathematical formulation for solving **Constraint 1** (Unreliable Telemetry Ingestion) and **Constraint 2** (Conflicting Sources & Anti-LWW Truth Arbitration) in **The Stranded Network**.

---

## 1. System Architecture Overview

In a regional disruption management command center, dispatchers make life-critical passenger allocations based on automated telemetry (track speeds, crowd sizes, traction voltage) and multi-source operational feeds (station dispatchers, hardware interlockings, regional schedules, public alerts).

Naive architectures fail when sensor feeds degrade or when delayed feeds arrive out of temporal order. This platform implements a resilient, dual-engine architecture:

```
[ Trackside Sensors / GPS / Gates ]       [ SCADA / Regional / Dispatch Feeds ]
                 │                                            │
                 ▼                                            ▼
   ┌───────────────────────────┐                ┌───────────────────────────┐
   │       CONSTRAINT 1:       │                │       CONSTRAINT 2:       │
   │  Telemetry Quality Engine │                │ Truth Arbitration Engine  │
   │  ───────────────────────  │                │  ───────────────────────  │
   │  • Bi-Temporal Lag Check  │                │  • Anti-LWW Guard         │
   │  • Heartbeat Gap Tracker  │                │  • Staleness Decay (Half-Life)
   │  • Modified Z-Score / MAD │  Corroboration │  • Source Authority Tier  │
   │  • Stuck ADC Detector     ├───────────────►│  • Physical Sensor Witness│
   │  • Adaptive EMA Smoother  │   Telemetry    │  • Causal Vector Clocks   │
   │  • Inverse-Variance Fusion│                │  • Fail-Safe Quarantine   │
   └─────────────┬─────────────┘                └─────────────┬─────────────┘
                 │                                            │
                 ▼                                            ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │                    SUPABASE / POSTGRESQL DATA LAYER                    │
   │   (telemetry_readings, source_records, conflict_resolutions, audit)   │
   └───────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │                      PASSENGER ALLOCATION ENGINE                       │
   │  Guarantees whole-party preservation, zero over-allocation, and fair   │
   │  priority dispatch across replacement fleet and multi-modal transfers. │
   └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Constraint 1: Unreliable Telemetry Ingestion & Quality Engine

### 2.1 Problem Specification
Incoming telemetry readings from trackside sensors, vehicle GPS trackers, and turnstile crowd monitors become unreliable in real-world scenarios:
1. **Missing readings**: Dropped network ticks or communication gaps.
2. **Sudden spikes**: Electrical noise or transceiver anomalies causing physically impossible jumps.
3. **Repeated values (Stuck sensor)**: Frozen ADC or locked memory producing zero-variance constant outputs.
4. **Unusual fluctuation**: High-frequency jitter and sensor noise.
5. **Delayed observations**: Packets arriving late or out-of-order due to buffered cellular/satellite uplink.
6. **Conflicted readings from different sensors**: Multiple sensors measuring the same physical location reporting divergent values.

---

### 2.2 Mathematical & Algorithmic Mitigation

#### 1. Bi-Temporal Out-of-Order Reconciler
Every reading records two distinct temporal stamps:
- $t_{\text{observed}}$: Event time recorded at sensor clock.
- $t_{\text{ingested}}$: Server clock arrival time.

$$\Delta t_{\text{lag}} = t_{\text{ingested}} - t_{\text{observed}}$$

If $\Delta t_{\text{lag}} > T_{\text{threshold}}$ ($60\text{s}$), the packet is flagged with `DELAYED_OBSERVATION_LAG`. If $t_{\text{observed}} < t_{\text{last\_observed}}$, the reading is recognized as retroactive out-of-order; it is processed in historical context rather than overwriting current real-time state.

#### 2. Temporal Heartbeat & Gap Imputation
For sensor expected interval $\Delta t_{\text{expected}}$:
$$\text{Gap} = t_{\text{observed}, k} - t_{\text{observed}, k-1}$$
If $\text{Gap} > 2.0 \times \Delta t_{\text{expected}}$, the engine flags `HEARTBEAT_GAP_MISSED_N_READINGS`, applies temporal confidence decay $C_{\text{time}} = e^{-\lambda \cdot \text{Gap}}$, and computes an imputed baseline.

#### 3. Modified Z-Score & Physical Bound Spike Rejection
Standard standard deviation $(\sigma)$ is vulnerable to the very spikes it tries to detect. Instead, the engine uses **Median Absolute Deviation (MAD)** over rolling window $W$:

$$\tilde{x} = \text{median}(X)$$
$$\text{MAD} = \text{median}(|x_i - \tilde{x}|)$$
$$M_i = \frac{0.6745 \cdot |x_i - \tilde{x}|}{\text{MAD}}$$

- If $M_i > 3.5$ OR $x_i \notin [\text{nominal\_min}, \text{nominal\_max}]$ OR rate of change $\left|\frac{\Delta x}{\Delta t}\right| > \text{max\_rate}$, the reading is classified as `SPIKE_REJECTED`.
- In rejected cases, the raw spike is quarantined, and the smoothed trajectory uses the previous filtered estimate.

#### 4. Zero-Variance Stuck-Sensor Detector
In real environments (crowds, vehicle speeds, rail track speeds), continuous physical quantities fluctuate naturally.
Over rolling window $K \ge 4$:
$$\sigma^2 = \frac{1}{K-1} \sum_{i=1}^K (x_i - \bar{x})^2$$
If $\sigma^2 < \epsilon$ ($10^{-5}$), the sensor is flagged `STUCK_SENSOR_CONSTANT_VALUE`. If sustained for $\ge 6$ ticks, the sensor status transitions to `QUARANTINED`.

#### 5. Adaptive EMA Jitter Filter
To remove excessive noise without introducing phase distortion:
$$\hat{x}_t = \alpha_t \cdot x_t + (1 - \alpha_t) \cdot \hat{x}_{t-1}$$
The smoothing parameter $\alpha_t$ adapts dynamically based on sensor quality $Q_t$:
$$\alpha_t = \text{clamp}(0.15, 0.60, 0.5 \cdot Q_t)$$

#### 6. Inverse-Variance Multi-Sensor Consensus Fusion
When $N$ sensors observe the same location:
1. **Byzantine Discordance Filter**: Computes median $\tilde{X}$ and excludes sensors whose divergence exceeds $3.0 \times \text{MAD}$.
2. **Weighted Fusion**: Trustworthy sensors are weighted inversely proportional to their variance $\sigma_s^2$ and quality $Q_s$:
$$w_s = \frac{Q_s}{\sigma_s^2}, \quad X_{\text{fused}} = \frac{\sum_{s=1}^m w_s \cdot x_s}{\sum_{s=1}^m w_s}$$

---

## 3. Constraint 2: Truth Arbitration & Stale Source Resolution (Anti-LWW)

### 3.1 Problem Specification
Two supposedly reliable sources provide conflicting information, and at least one record is stale.

**The Fatal Flaw of Naive Last-Write-Wins (LWW):**
- **Scenario**: At 08:30, an operator at Katpadi detects an emergency track breach and reports `CLOSED`.
- At 08:00, an automated regional schedule cache created an entry saying `OPEN`.
- Due to a network buffer glitch or satellite reconnection, the 08:00 record arrives at the server at 08:32, while the 08:30 operator report arrived at 08:31.
- A naive system using `ORDER BY arrival_time DESC` or `ORDER BY timestamp DESC` blindly treats the 08:32 arrival as the "newest truth" and marks Katpadi as `OPEN`, directing passengers into a dangerous derailment zone!

The Stranded Network strictly prohibits silent Last-Write-Wins.

---

### 3.2 Non-Trivial Multi-Factor Truth Vector Formulation

For every conflicting candidate assertion $A$ from source $S$:

$$V_{\text{truth}}(A) = 0.35 \cdot S_t + 0.25 \cdot T_S + 0.30 \cdot C_W + 0.10 \cdot V_{\text{causal}} - P_{\text{transit}}$$

#### 1. Real-World Staleness Half-Life Decay ($S_t$)
Measures physical elapsed time since the observation actually occurred at its origin:
$$\Delta t_{\text{event}} = t_{\text{current}} - t_{\text{event\_origin}}$$
$$S_t = 2^{-\frac{\Delta t_{\text{event}}}{\tau_{\text{half\_life}}}}$$
- Default half-life $\tau = 300\text{s}$ (5 minutes). A 45-minute-old record has $S_t = 2^{-9} \approx 0.0019$, completely stripping its authority regardless of how recently it arrived.

#### 2. Transit Lag Penalty ($P_{\text{transit}}$)
Measures how long the packet was stuck in queue or network transit:
$$\Delta t_{\text{transit}} = t_{\text{ingested}} - t_{\text{event\_origin}}$$
If $\Delta t_{\text{transit}} > 60\text{s}$, a penalty $P_{\text{transit}} = \min(0.25, \frac{\Delta t_{\text{transit}} - 60}{600})$ is subtracted.

#### 3. Source Authority Tier ($T_S$)
Hierarchical credibility weighting:
- `HARDWARE_SCADA` (Track circuit / interlock relay): **0.95**
- `OPERATOR_DISPATCH` (Station operations chief): **0.90**
- `REGIONAL_FEED` (Regional timetabling service): **0.75**
- `THIRD_PARTY_API` (External transit API): **0.65**
- `PASSENGER_CROWDSOURCED` (Mobile passenger app): **0.50**

#### 4. Physical Sensor Witness Cross-Corroboration ($C_W$)
Cross-references real-time physical sensor data from Constraint 1:
- If Source A claims "Katpadi Track is Closed", and the track Doppler radar + axle counter show $0.0\text{ km/h}$ with trip flag active, witness corroboration $C_W = 0.95$.
- If Source B claims "Track is Clear/Open", but radar confirms $0.0\text{ km/h}$, witness corroboration refutes claim ($C_W = 0.15$).

#### 5. Causal Sequence Clock ($V_{\text{causal}}$)
Tracks Lamport sequence numbers. Outdated causal epochs are penalized ($0.3$), while current causal epochs score $1.0$.

#### 6. Ambiguity Threshold & Fail-Safe Quarantine Rule
Let $L$ be the leading candidate and $R$ be the runner-up:
$$\Delta_{\text{margin}} = V_{\text{truth}}(L) - V_{\text{truth}}(R)$$

- **Resolution Rule**: If $\Delta_{\text{margin}} \ge 0.15$ (15% clear victory margin), candidate $L$ is accepted. If $L$ was NOT the newest arrival, an explicit `[ANTI-LWW ENFORCED]` log entry is recorded with full audit factors.
- **Fail-Safe Quarantine**: If $\Delta_{\text{margin}} < 0.15$ (close call or ambiguous signals), the system **refuses to guess silently**. The entity enters `CONFLICT_QUARANTINED`, sounds visual siren alerts in the UI, and enforces a conservative safety fallback (e.g. `TREAT_CORRIDOR_CLOSED_HOLD_DISPATCH` or `CLAMP_TO_MINIMUM_CAPACITY`).

---

## 4. Database Schema (Supabase / PostgreSQL)

The database schema (`supabase/schema.sql`) implements tables, check constraints, foreign keys, and indexes:

| Table | Purpose |
|---|---|
| `users_profile` | Supabase auth integration & role-based profiles (`operator`, `dispatcher`, `auditor`, `passenger`). |
| `sensors` | Registered sensors with nominal bounds, rates of change, and health tracking. |
| `telemetry_readings` | High-frequency telemetry log with raw value, smoothed value, quality score, and anomaly flags. |
| `source_records` | External assertions with origin timestamp, ingestion timestamp, and vector clock. |
| `conflict_resolutions`| Audit ledger of all arbitrated conflicts, margin of victory, decision vectors, and rationale. |
| `corridor_stops` | Station status, closure reasons, and verified arbitrated states. |
| `vehicles` | Fleet capacity, current stops, and active telemetry health. |
| `parties` | Stranded groups with priority scores and allocated relief vehicles. |
| `audit_log` | Immutable append-only audit trail. |

---

## 5. Verification & Test Suite

The implementation is verified by 16 automated tests in Vitest:

| Test Suite | Tests | Status | Coverage |
|---|---|---|---|
| `server/telemetry/qualityEngine.test.ts` | 5 | **PASS** | Spikes, Stuck Sensor, Heartbeat Gaps, Lag Delay, Byzantine Sensor Fusion. |
| `server/conflicts/truthArbitrator.test.ts` | 3 | **PASS** | Anti-LWW Stale Replay Rejection, Sensor Witness Corroboration, Quarantine Fail-Safe. |
| `src/engine/allocate.test.ts` | 8 | **PASS** | Zero over-allocation, accessibility constraints, whole-party preservation. |

---

## 6. How to Run & Verify

1. **Start Full Stack (Node Backend + Vite UI)**:
   ```bash
   npm run dev:all
   ```
2. **Run Backend Only**:
   ```bash
   npm run server
   ```
3. **Execute Vitest Verification**:
   ```bash
   npm test
   ```
4. **Interactive Verification in Browser**:
   - Navigate to `http://localhost:5173/` for the **Landing Page**.
   - Test live injections in the **Interactive Verification Sandbox**.
   - Open **Login Page** and test 1-click Quick Login demo accounts.
   - Switch to **📡 Telemetry Ingestion (C-1)** tab to view real-time SSE streaming.
   - Switch to **⚖️ Conflict Ledger (C-2)** tab to inspect Anti-LWW arbitration matrices.
