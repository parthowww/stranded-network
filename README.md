# The Stranded Network

> A disruption-management dashboard that groups stranded passengers, allocates limited replacement seats fairly and transparently, and suggests alternative journeys for anyone who cannot be placed. "Type is the interface" — designed with typographic hierarchy, fluid variable fonts, and zero decorative chrome.

---

## 1. Problem Statement
When mainline rail or regional transport services face emergency disruption (cancellations, derailments, signal failures, or corridor blockades), operators face chaotic demand:
- Passenger parties of varying group sizes (individuals, families with infants, wheelchair users, elderly passengers) are stranded at stations.
- Replacement fleet capacity (relief buses, emergency coaches, special shuttles) is scarce, asymmetric across depots, and insufficient to meet total demand.
- Existing ad-hoc allocation leads to overcrowding, arbitrary boarding, inaccessible vehicles for disabled passengers, and total lack of transparency.

**The Stranded Network** solves this in-browser by executing a deterministic, priority-weighted allocation engine that guarantees zero over-allocation, preserves whole party integrity, honors accessibility constraints, provides complete transparency on prioritization scores, and automatically computes multi-modal onward connections for unplaced passengers.

---

## 2. Capability-to-Feature Map

| Operational Capability | Dashboard Feature | Implementation Details |
|---|---|---|
| **Transparent Priority Allocation** | Inline Party Explanation Panel (`Explain.tsx`) | Displays exact priority score (0–100), rule-by-rule point contribution, and proportional hairlines showing weight impact. |
| **Capacity Safety Verification** | Typographic Capacity Monitor (`Capacity.tsx`) | Renders seat usage with block glyphs (`█` used, `░` free), explicit counts (`34 / 40 seats`, `acc 2/3`), and an automated safety assertion `✓ Capacity verified: no vehicle over-allocated`. |
| **Instant Real-Time Re-allocation** | Reactive Engine State (`App.tsx` + `allocate.ts`) | Dispatched purely in browser via `useMemo`. Toggling a vehicle, modifying seat count, adding delays, or closing a stop immediately re-allocates all 58 parties within <1ms. |
| **Corridor Blockade Handling** | Interactive Stop Closures (`Controls.tsx`) | Clicking any stop truncates the vehicle route at the first closed stop; all subsequent downstream stations become unreachable, immediately triggering re-routing or alternative journeys. |
| **Alternative Journey Routing** | Multi-Modal Connection Finder (`allocate.ts`) | For unresolved parties, computes top 3 viable alternatives: (a) direct services arriving after deadline, or (b) journeys via nearby transfer nodes paired with onward links (e.g. Katpadi → Vellore +45m, Salem → Erode +50m). |
| **Manual Dispatch Control** | Alternative Commitment ("Place" Action) | Operators can click "Place" on any alternative journey to commit a manual placement override, which is capacity-checked, rendered in italics, and logged in the decision audit trail. |
| **Corridor Demand Overview** | Passenger Corridor Flows (`Groups.tsx`) | Aggregates origin → destination flows in large condensed type with placed vs. unresolved counts in monospace. |
| **Dynamic Urgency Feedback** | Variable Masthead Numeral (`Masthead.tsx`) | 30vw animated `NumberFlow` numeral whose Bricolage Grotesque weight (`wght` 200–800) and width (`wdth` 75–100) dynamically scale with unresolved demand. At 0, displays calm light text: *"Everyone is placed."* |
| **Customer Mobile Web App** | Live Passenger Gateway (`CustomerApp.tsx`) | Dedicated mobile app for stranded passengers: live digital boarding pass with barcodes for placed travellers, queue breakdown and transparent disruption status for unresolved passengers, and 1-tap alternative acceptance. |
| **Real-Time Cross-App Sync** | BroadcastChannel Sync (`broadcast.ts`) | Bidirectional zero-backend synchronization between the station operator terminal and customer phones. Dispatch changes immediately update customer phones; customer journey acceptance instantly updates the operator ledger. |

---

## 3. Scoring Rules & Formula

The priority score is computed by:
$$\text{Score} = 100 \times \frac{\sum (\text{weight}_i \times \text{factor}_i)}{\sum \text{weight}_i}$$

Each rule calculates points: $\text{points}_i = 100 \times \frac{\text{weight}_i \times \text{factor}_i}{\sum \text{weight}_j}$.

### Default Rule Set

| Rule | Default Weight | Factor Function | Operational Rationale |
|---|---|---|---|
| **Wheelchair / step-free need** | 30 | `wheelchair ? 1 : 0` | Mandatory accessibility compliance; requires dedicated accessible vehicle space. |
| **Vulnerable traveller** | 25 | `vulnerable ? 1 : 0` | Prioritizes families with children under 5, elderly travellers, and medical needs. |
| **Deadline urgency** | 25 | $\max(0, 1 - \frac{\text{deadline}}{960})$ | Prioritizes travellers with critical tight connection deadlines (300m to 960m window). |
| **Time already stranded** | 10 | $\min(1, \frac{\text{waitMin}}{180})$ | Fair queueing factor: mitigates extreme wait times accumulated at the terminal. |
| **Held confirmed ticket** | 10 | `confirmed ? 1 : 0` | Respects prior confirmed bookings versus unreserved walk-up passengers. |

*Weights are fully configurable via Radix sliders in the Network Controls panel, immediately recalibrating priorities across the roster.*

---

## 4. Stack Rationale

- **Vite + React + TypeScript**: Zero overhead, instant hot-module reloading, and end-to-end type safety across the pure allocation engine and UI components.
- **Plain CSS with CSS Variables**: No Tailwind or CSS framework runtime. Strict 12-column timetable poster aesthetic with 0-radius corners, 1px separation hairlines, and typographic inversion.
- **Variable Fonts**:
  - `Bricolage Grotesque Variable`: High-impact display type utilising dynamic `wght` and `wdth` interpolation.
  - `Geist Variable` & `Geist Mono Variable`: Crisp Swiss-style body and tabular numerals for timetable readability.
- **NumberFlow (`@number-flow/react`)**: Smooth, accessible transitions for numeric counts without layout thrash.
- **Radix UI (`@radix-ui/react-slider`, `@radix-ui/react-switch`)**: Unstyled, fully accessible interactive primitives styled with square geometry.
- **Vitest**: Blazing-fast unit testing framework executing 8 comprehensive test suites including a 200-scenario Monte Carlo invariant test in <50ms.

---

## 5. Known Limits

1. **Client-Only Single-Session**: All state resides in memory (`useState` / `useMemo`). Refreshing resets to the initial seeded disruption scenario (or clicking "Reset Scenario").
2. **Deterministic Tie-Breaking**: Parties with identical scores and wait times break ties deterministically on alphabetical Party ID (`a.id.localeCompare(b.id)`).
3. **Single Transfer Hop**: Alternative journeys currently calculate up to 1 vehicle leg + 1 onward link (e.g., coach to Katpadi + regional link to Vellore). Multi-transfer chain routing is out of scope for this 4-hour MVP.
4. **Whole-Party Integrity**: Parties are strictly kept together and never split across vehicles, which may leave 1 or 2 seats unallocated if the next party in priority order is larger than the remaining capacity.

---

## 6. Screenshots & Verification

The application was verified in Chrome and Edge headless environments with the following captures:
1. `screenshot-desktop-main.png`: Full desktop view (Dark mode / Light mode) featuring the 30vw masthead numeral, capacity glyph bars, corridor flows, roster, and controls.
2. `screenshot-desktop-explain.png`: Inline expanded explanation panel showing the 23.9 score breakdown, proportional hairline bars, decision sentence, and suggested alternative journeys.
3. `screenshot-desktop-dark.png`: Alternate theme demonstration showcasing WCAG AA contrast, typographic status inversion, and signal accents.
4. `screenshot-mobile-360.png`: Responsive layout verified on narrow viewports down to 360px without truncation or horizontal overflow.
5. `screenshot-interaction-closure.png`: Dynamic response when Katpadi corridor is closed: unresolved count jumps from 43 to 81, and numeral scales dynamically.
6. `screenshot-placed-committed.png`: Result of clicking "Place" on an alternative journey: status flips to italic `Manual: West Coast Relief Coach A`, capacity is re-checked, and decision is logged.
