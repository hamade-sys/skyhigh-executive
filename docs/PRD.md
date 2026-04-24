# SkyForce — Full Product Requirements Document
## ICAN · International Civil Aviation Network
### Executive Simulation Platform — Claude Code Product Brief

---

## 1. PRODUCT OVERVIEW

**Product Name:** SkyForce  
**Client:** ICAN — International Civil Aviation Network  
**Purpose:** A 20-quarter airline business simulation for senior executive development. 5 teams of 4 players build and operate competing airlines from scratch, responding to board decisions, world events, market forces, and live facilitated scenarios over 1.5 days.  
**Stack:** Next.js 14, TypeScript, Tailwind CSS, Supabase (PostgreSQL + Realtime), Vercel  
**Visual Identity:** ICAN brand system — Teal (#00C2CB), Charcoal (#545454), white backgrounds, Inter font, clean management-consultancy aesthetic  

---

## 2. STRUCTURAL OVERVIEW

### 2.1 Participants
- **5 teams** of 4 players each = 20 participants total
- Each team has 4 **roles**: CEO, CFO, CMO, CHRO
- **1 shared account per team** — all 4 role-players access the platform from one login. There is no individual role-based login. The team operates the airline collectively from a single interface.
- Roles determine who gets specific sealed briefs in live simulations (handled offline by facilitators — not enforced in the platform)

### 2.2 Game Duration
- **20 Quarters** = 5 simulated game years
- Each game year = 5 real-world years from the year 2000 (for aircraft timeline mapping only)
- Physical simulation runs over **1.5 days**

### 2.3 Game Flow by Quarter

| Phase | Quarter | What Happens |
|-------|---------|-------------|
| Q1 | Brand Building | Team sets airline identity, strategy, pricing philosophy, staffing philosophy, marketing philosophy, CSR theme, hub airport selection. No planes purchased. No routes. Presentation to panel. |
| After Q1 | Cash Injection | Based on L0 (Brand Building) presentation scoring: 1st = +$80M, 2nd = +$60M, 3rd = +$40M, 4th = +$20M, 5th = +$0. Total Q2 capital = $150M seed + injection. |
| Q2 | First Quarter | Teams receive cash injection, place first aircraft orders, select routes (active from Q3), submit Q2 board decision. |
| Q3–Q19 | Simulation Runs | Each quarter: world news revealed → board decision submitted → live sim (if applicable, handled offline) → quarterly operational submissions (planes, routes, sliders) → admin processes → next quarter begins. |
| Q20 | Final Quarter | Final board decision. Investor pitch (live, offline). Final scoring. Awards. |

### 2.4 Live Simulations (7 total)
Live simulations are **fully offline** — facilitated by ICAN trainers in a physical room. Their **financial and brand impacts are manually entered by the Admin** into the admin portal. The platform does not enforce or run live simulations. It only reflects their outcomes.

| ID | Name | Timing | Who |
|----|------|---------|-----|
| L0 | Brand Building | Q1 | All teams |
| L1 | The Strike — Bilateral Negotiation | Between Q4–Q5 | Cross-team pairings |
| L2 | Talent Heist Live | Q12 (simultaneous with S14) | CEOs extracted |
| L3 | The Whistleblower | Between Q7–Q8 | CEOs only |
| L4 | The Podium — Press Conference | Between Q10–Q11 | CEOs only |
| L6 | The Elevator — FIFA Pitch | Between Q7–Q8 | CMOs only, one at a time |
| L7 | Crisis Operations Room | Between Q8–Q9 | CMOs + CFOs |

---

## 3. PLAYER PLATFORM

### 3.1 Design Principles
- Light, white-dominant interface
- ICAN teal (#00C2CB) as primary accent
- Charcoal (#545454) for text and data
- Inter font throughout
- Clean, professional — inspired by McKinsey/BCG aesthetic
- **Real-world interactive map** as the core visual anchor
- Mobile-responsive but desktop-first (facilitators may use tablets)

### 3.2 Player Views (Pages/Sections)

#### A. Airline Dashboard (Home)
The main operational view. Shows at a glance:

**Top Bar — Key Metrics (updated every quarter)**
- Airline Name + Logo (team-chosen in Q1)
- Quarter indicator: "Q7 of 20 — Year 3 · Q3 · ~2007"
- Cash Balance
- Total Debt
- Airline Value (Brand Value score, shown as $ index)
- Brand Points
- Customer Loyalty %
- Ops Points

**Main Body — Four Panels**
1. **Financial Health Panel** — Cash, Debt, Revenue this quarter, P&L, quarterly trend sparkline
2. **Brand Health Panel** — Brand Pts, Customer Loyalty %, Reputation events, Brand Value component score
3. **Operations Panel** — Fleet size, Routes active, Occupancy rate (avg), Ops Pts
4. **World Map** (see Section 3.3)

**Right Sidebar — Active Quarter**
- Current quarter number and game year context
- Status: "Awaiting decision / Decision submitted / Quarter closed"
- Timer (if applicable — for time-limited decisions)
- Latest world news headlines (5 for current quarter)
- Pending actions for this quarter

#### B. World Map View (Core Feature)
Full-screen interactive map using **Mapbox GL JS** or **Leaflet + OpenStreetMap**.

**Map Features:**
- All 100 cities in the simulation plotted as airport nodes
- City nodes scaled by tier (Tier 1 = larger icon, Tier 4 = smaller)
- **Team's active routes** shown as animated arc lines in their team color
- **Other teams' routes** shown in muted grey (visible but not dominant)
- **Hub airport** highlighted with a distinct ring/glow
- Click any city: shows City Demand card (Tourism/day, Business/day, Amplifier, Airport Tier, Slot fee)
- Click own route: shows Route Detail (occupancy %, daily pax, revenue/quarter, competing airlines on route)
- **Add Route button**: draws a line from hub or existing connected city — opens Route Setup modal
- **Route Setup Modal**: select origin, destination, aircraft to assign, daily frequency, pricing tier → submit as Q2+ route order

**Route Arc Color Coding:**
- Own routes: ICAN Teal (#00C2CB)
- Profitable routes (>70% occupancy): Green ring
- Underperforming routes (<50% occupancy): Orange ring
- Loss-making routes: Red ring

#### C. Fleet Management
**My Fleet table:**
- Aircraft name, type, seats (F/C/Y), range, fuel burn
- Status: Active / Ordered (arriving Q+1) / Grounded / Leased
- Book value (auto-calculated with depreciation)
- Quarterly depreciation amount
- Current assigned route(s)
- Monthly/quarterly operating cost
- Eco-engine upgrade button (if not applied)

**Order Aircraft button** → Aircraft Market Modal:
- All currently available aircraft (based on current game quarter — launches unlock per timeline)
- For each: full spec table (seats by class, range, fuel burn, cargo capacity)
- Buy price vs. quarterly lease payment
- Eco-engine upgrade option (+10% fuel efficiency for listed cost)
- Financing: Cash or Debt (shows effective borrowing rate based on current state)
- Delivery: "Arrives Q[n+1]"
- Shared pool indicator (e.g., Flash Deal at Q13: "14 of 20 planes remaining")

**Depreciation Schedule:**
- Passenger/cargo aircraft: 5%/year (1.25%/quarter), floor 10% of purchase price
- Formula: Book Value Q(n) = Purchase Price × (0.9875)^n, minimum = Price × 0.10
- Eco-engine upgrade depreciates separately: 10%/year (2.5%/quarter), floor $0
- Ground equipment: 15%/year (3.75%/quarter), floor $0
- Displayed in fleet table as "Book Value" column, updated automatically each quarter close

#### D. Route Management
Table of all active and pending routes:

| Route | Aircraft | Freq/day | Q Revenue | Occupancy | Status | Actions |
|-------|----------|----------|-----------|-----------|--------|---------|

- **Open New Route**: select origin + destination from map or dropdown, assign aircraft, set frequency and pricing tier
- **Close Route**: marks as closed next quarter. Warning: landing slots may be forfeited.
- **Adjust Frequency**: add or remove daily departures. Each additional departure = +1 slot fee per day.

**Route Economics (auto-calculated):**
- Slot fee per movement (based on destination tier): Tier 1: $40–45K, Tier 2: $22–35K, Tier 3: $10–20K, Tier 4: $5–10K
- Quarterly slot cost = slot fee × daily departures × 91 days
- Revenue = daily_pax × ticket_price × 91 days
- Daily pax = route_demand × market_share (see Demand Formula, Section 5.4)

#### E. Financials
Full P&L and balance sheet view:

**Income Statement (quarterly)**
- Passenger Revenue (by route)
- Cargo Revenue (if cargo division active)
- Other Income (profit-sharing from investments, subsidies)
- Total Revenue
- Fuel Costs (per route: distance × fuel burn × L/km × fuel price)
- Staff Costs (based on salary slider × market rate)
- Marketing Spend (from slider)
- In-Flight Service Cost (food + gifts sliders)
- Rewards Program Cost (slider)
- Slot Fees (all routes combined)
- Hub Terminal Fee (quarterly)
- Maintenance Costs (aging fleet premium if applicable)
- Depreciation (fleet)
- Debt Interest (total debt × effective rate)
- Total Costs
- Net Profit / Loss

**Balance Sheet**
- Cash
- Aircraft (at book value, net of depreciation)
- Total Assets
- Total Debt (breakdown by quarter of origin and interest rate)
- Net Equity (Airline Value)

**Cash Flow**
- Operating cash flow
- CapEx (aircraft purchases)
- Financing (borrowing, repayments)
- Net change in cash

**Borrow Capital button:**
- Shows current effective borrowing rate (Base Rate + Debt Ratio Premium + Brand Adjustment)
- Maximum borrowing capacity = (Airline Value × 60%) − Current Total Debt
- Confirm amount → creates debt instrument with current quarter's rate

#### F. Quarterly Operations Submission
Accessible when the current quarter is open. This is the quarterly ops form that must be submitted before quarter close.

**Section 1 — Spending Sliders**
Five sliders, each with 6 levels (Very Low → Extreme). Sliders show the impact of each level on brand points, customer loyalty, and costs before the team commits.

| Category | Very Low | Low | Standard | High | Very High | Extreme |
|----------|----------|-----|----------|------|-----------|---------|
| Staff & Training | -18% market, Ops -5, Loyalty -3% | -8%, Ops -2, -1% | Baseline | +10%, Ops +3, +2% | +20%, Ops +6, +4% | +35%, Ops +10, +7%, Brand +5 |
| Marketing | Brand -4, Loyalty -2%, Rev -5% | Brand -1, -1%, -2% | Baseline | Brand +3, +1%, +4% | Brand +6, +3%, +8% | Brand +10, +6%, +14% |
| In-Flight Food | Brand -3, Loyalty -3%, Cost -$2M | Brand -1, -1%, -$1M | Baseline | Brand +2, +2%, +$3M | Brand +5, +4%, +$8M | Brand +8, +7%, +$16M, Rev +6% |
| In-Flight Gifts | Brand -1 | Loyalty 0% | Loyalty +1% | Brand +1, +2% | Brand +3, +4%, social posts ↑ | Brand +5, +6%, Rev +3% |
| Rewards Program | Loyalty -5% | Loyalty 0% | Loyalty +2%, Rev repeat +3% | Loyalty +5%, Rev repeat +7% | Loyalty +8%, Rev +12%, Brand +2 | Loyalty +12%, Rev +18%, Brand +4, Ops +$6M cost |

**Compounding rule:** Maintaining the same slider level for 3+ consecutive quarters applies a 1.2× multiplier to that slider's brand/loyalty contribution, capped at 1.5× after 6 consecutive quarters.

**Section 2 — Aircraft Orders**
- Select aircraft type (from available in market)
- Quantity (subject to shared pool limits if applicable)
- Financing method: Cash or Debt
- Orders confirmed → aircraft arrive next quarter

**Section 3 — Route Changes**
- Open new routes (with airport selection, aircraft assignment, frequency, pricing)
- Close existing routes
- Frequency adjustments
- All route changes take effect next quarter

**Submit Button:** Locks the quarterly ops submission. Greys out after submission. Admin can unlock if needed.

#### G. Board Decisions (Scenario Decisions)
Each quarter may include 1 or more board decisions (scenarios S1–S18). These appear as decision cards at the start of the quarter with full scenario text.

**Decision Card Structure:**
- Scenario number and title
- Context (summary text of the situation)
- World News impact note (if any news this quarter affects this decision)
- Options A, B, C, D (and E where applicable) — each clearly labeled
- For time-limited decisions: visible countdown timer
- "Submit Decision" button → confirms and locks choice
- After submission: "Awaiting quarter close" status

**Time-Limited Decisions:**
- S3 Flash Deal: 30-minute countdown visible
- S10 World Cup Bet (blind bid): team submits bid amount + presenter name before pitch
- S16 Moscow Signal: visible countdown + lock-in period selection (1–4 quarters)
- Any other scenario with a time element: countdown shown at top of decision card

**Important:** Decisions cannot be changed after submission. Admin can override via admin portal if needed.

#### H. World News Feed
Per quarter: 5 news headlines with impact tags (Tourism / Business / Cargo / Ops / Brand / Fuel / No Impact). Displayed at the start of each quarter before decisions are made. Teams can reference these throughout the quarter.

#### I. Leaderboard
Visible at all times:
- All 5 airlines ranked by Brand Value (primary) 
- Secondary columns: Cash Balance, Brand Pts, Customer Loyalty %, Routes Active, Fleet Size
- Trend arrows (vs. last quarter)
- Note: exact financial details of competitors not shown — only rank and the metrics listed above

---

## 4. AIRPORT & HUB SYSTEM

### 4.1 Hub Selection (Q1)
- Each team selects one hub airport from the 100 available cities
- **No two teams may share the same hub**
- If two teams select the same hub: a **blind bid** is held in the platform. Both teams submit a bid amount. Higher bid wins the hub. Losing team must select again. Bid amount is deducted from cash immediately.
- Hub is permanent for the simulation (cannot change)
- Hub terminal fee is paid every quarter regardless of route activity

### 4.2 Hub Terminal Fees (Quarterly)
- Tier 1 airports: $12M–$18M/quarter
- Tier 2 airports: $8M–$16M/quarter
- Tier 3 airports: $3M–$9M/quarter
- Tier 4 airports: $1M–$5M/quarter

### 4.3 Route Landing Fees (Per Movement)
- Tier 1 destination: $40,000–$45,000 per departure
- Tier 2 destination: $22,000–$35,000 per departure
- Tier 3 destination: $10,000–$20,000 per departure
- Tier 4 destination: $5,000–$10,000 per departure
- Quarterly slot cost = landing fee × daily departures × 91 days/quarter

### 4.4 Secondary Hubs
Teams may add a secondary hub in later quarters. Cost = double the standard terminal fee of the chosen secondary airport. Cannot be the same as another team's primary hub.

---

## 5. DEMAND & FINANCIAL MECHANICS

### 5.1 City Demand (100 Cities)
Each city has:
- **Tourism demand** (passengers/day) — base figure for Q1
- **Business demand** (passengers/day) — base figure for Q1
- **Airport amplifier** — route demand multiplier
- **Annual growth rate** — applied per game year (4 quarters)

Growth applied per quarter: `city_demand_Q(n) = city_demand_Q1 × (1 + annual_growth/4)^(n-1)`

World News events can apply temporary multipliers (e.g., +35% Q10 World Cup) or permanent increases (e.g., DXB +8% from Q13) on top of the growth formula.

### 5.2 Route Demand Formula
```
city_A_tourism + city_B_tourism = route_tourism_base
city_A_business + city_B_business = route_business_base
amplifier = MIN(city_A.amplifier, city_B.amplifier)
effective_tourism = route_tourism_base × amplifier
effective_business = route_business_base × amplifier
total_route_demand_per_day = effective_tourism + effective_business
```

### 5.3 Airline Attractiveness Score (per route, per airline)
```
price_score = (avg_route_price / this_airline_price) × 100
  — capped: if price 10% below avg, score approaches 150; if 10% above avg, approaches 60
brand_score = MIN(100, brand_pts / 2)
loyalty_score = customer_loyalty_pct (0–100)
service_score = (in_flight_food_slider / 6 + in_flight_gifts_slider / 6 + rewards_slider / 6) / 3 × 100

attractiveness = (price_score × 0.45) + (brand_score × 0.25) + (loyalty_score × 0.20) + (service_score × 0.10)
```

### 5.4 Market Share & Occupancy
```
total_attractiveness = SUM(attractiveness for all airlines on this route)
airline_market_share = airline_attractiveness / total_attractiveness
daily_pax = total_route_demand_per_day × airline_market_share
daily_capacity = SUM(aircraft_seats × daily_departures, for this route)
occupancy = daily_pax / daily_capacity
occupancy = MIN(0.98, occupancy)   -- capped at 98%
```

If only 1 airline on route: `occupancy = MIN(0.98, total_route_demand / daily_capacity)`

If total capacity < demand on route: all airlines on route receive 98% occupancy (market is undersupplied — add flights).

### 5.5 Revenue Per Route (Quarterly)
```
ticket_price_premium = {budget: 0.80, standard: 1.00, premium: 1.25, ultra_premium: 1.60} × base_fare
quarterly_revenue = daily_pax × ticket_price × 91 days
```
Base fare calibrated per route based on distance and demand. Admin sets base fare table.

### 5.6 Fuel Cost Calculation
```
fuel_price_per_litre = (fuel_index / 100) × 0.18  -- baseline $0.18/L at index 100
fuel_cost_per_flight = distance_km × fuel_burn_L_per_km × fuel_price_per_litre
quarterly_fuel_cost = fuel_cost_per_flight × daily_departures × 91 × number_of_planes_on_route
```
Eco-engine upgrade reduces `fuel_burn_L_per_km` by 10% permanently for that aircraft.

### 5.7 Debt & Interest
```
effective_rate = base_rate + debt_ratio_premium + brand_adjustment
debt_ratio = total_debt / airline_value
debt_ratio_premium:
  < 30%:   +0.5%
  30–50%:  +1.5%
  50–70%:  +3.0%
  > 70%:   +5.0% (Distressed)
brand_adjustment:
  > 80 pts:  -0.5%
  50–80:     0%
  < 50:      +1.0%
  < 25:      +2.0%
max_borrowing = (airline_value × 0.60) - total_debt
quarterly_interest = total_debt × (effective_rate / 4)
```

### 5.8 Customer Loyalty Mechanics
Starting loyalty: 50% (adjusted by Q1 Brand Building multiplier — 1st place starts at 65%, 5th at 50%).

Loyalty changes per event:
- +10 Brand Pts event: +2% loyalty
- -10 Brand Pts event: -3% loyalty (harder to rebuild)
- Strike (no deal, L1): -15%
- Olympic Carrier card: +8%
- Mass redundancies (S15-A): -10%
- Reskill option (S13-C): +8% over 2 quarters
- Cocoa Crisis premium upgrade (S18-D, success): +5%
- Brand Grenade redemption arc (S12-D, success): +15% over 2 quarters

**Loyalty Demand Multiplier applied to demand fluctuations:**
- >80%: negative demand ×0.70 (protected), positive demand ×1.15
- 65–80%: negative ×0.85, positive ×1.05
- 50–65%: baseline ×1.00 both ways
- 35–50%: negative ×1.20, positive ×0.85
- <35%: negative ×1.40, positive ×0.70

### 5.9 Brand Value Formula (Admin Dashboard — Not Visible to Players as Formula)
```
brand_value = (financial_health × 0.35) + (brand_health × 0.50) + (operations_health × 0.15)

financial_health:
  cash_ratio = team_cash / (team_cash + team_total_debt)             [weight: 30%]
  debt_ratio_score = 100 - MIN(100, (debt/airline_value) × 100)      [weight: 35%]
  revenue_growth = vs. avg growth across all 5 teams this quarter     [weight: 35%]

brand_health:
  brand_pts_score = MIN(100, brand_pts / 2)                           [weight: 40%]
  customer_loyalty = loyalty_pct (direct, 0–100)                     [weight: 35%]
  reputation_events = 100 + sum(bonuses) + sum(penalties)             [weight: 25%]
    caps: MIN 0, MAX 120
    reputation cards: trusted_operator, safety_leader, green_leader, people_first
    reputation flags: anti_environment (permanent -15), greenwashing, media_crisis_unresolved

operations_health:
  ops_pts_score = MIN(100, ops_pts)                                    [weight: 40%]
  fleet_efficiency = (modern_fleet_planes / total_planes) × 100       [weight: 35%]
  staff_commitment = MIN(100, (staff_slider×10) + L1_deal_bonus - strike_penalty + people_first_bonus) [weight: 25%]
```

Brand Value displayed to teams as a single number (0–100 index), rounded to 1 decimal. Rank order shown. Component breakdown visible only in admin dashboard.

---

## 6. AIRCRAFT SYSTEM

### 6.1 Available at Game Start (Q1/Q2 — ~Year 2000)

| Aircraft | First | Biz | Eco | Total | Range (km) | Fuel (L/km) | Buy Price | Lease/Qtr |
|----------|-------|-----|-----|-------|-----------|-------------|-----------|-----------|
| Airbus A319 | 0 | 16 | 108 | 124 | 6,850 | 3.2 | $20M | $165K |
| Airbus A320 | 0 | 24 | 126 | 150 | 6,150 | 3.4 | $25M | $205K |
| Airbus A321 | 0 | 28 | 157 | 185 | 5,950 | 3.8 | $30M | $245K |
| Boeing 737-700 | 0 | 20 | 108 | 128 | 6,370 | 3.1 | $22M | $180K |
| Boeing 737-800 | 0 | 24 | 138 | 162 | 5,765 | 3.3 | $28M | $230K |
| Boeing 757-200 | 0 | 26 | 174 | 200 | 7,250 | 3.9 | $38M | $310K |
| Boeing 767-300ER | 18 | 42 | 158 | 218 | 11,093 | 4.8 | $55M | $450K |
| Airbus A330-200 | 17 | 42 | 194 | 253 | 12,500 | 4.6 | $75M | $615K |
| Boeing 777-200ER | 21 | 52 | 240 | 313 | 13,080 | 5.2 | $90M | $735K |
| Boeing 747-400 | 18 | 58 | 340 | 416 | 13,450 | 8.5 | $120M | $980K |

**Cargo Aircraft:**

| Aircraft | Cargo (T) | Range (km) | Fuel (L/km) | Buy Price | Lease/Qtr |
|----------|-----------|-----------|-------------|-----------|-----------|
| Boeing 737-300F | 20T | 4,200 | 3.4 | $18M | $148K |
| Boeing 757-200F | 39T | 7,500 | 4.2 | $35M | $285K |
| Boeing 767-300F | 52T | 9,100 | 6.5 | $50M | $410K |
| Boeing 747-400F | 113T | 8,230 | 14.0 | $110M | $900K |

**Eco-Engine Upgrade:** Available for all aircraft. Reduces fuel burn by 10% permanently. Upgrade costs: A319 $2M, A320 $2.5M, A321 $3M, 737-700 $2.2M, 737-800 $2.8M, 757-200 $3.8M, 767-300ER $5.5M, A330-200 $7.5M, 777-200ER $9M, 747-400 $12M. Cargo: 737F $1.8M, 757F $3.5M, 767F $5M, 747F $11M.

### 6.2 Aircraft Unlocks by Quarter (Launch Schedule)
New aircraft types become purchasable in the platform when their unlock quarter is reached:

| Quarter | Aircraft Unlocked |
|---------|-------------------|
| Q5 | Airbus A380-800 (555 seats, $200M, range 15,200km) |
| Q8 | Boeing 787-9 Dreamliner (296 seats, $80M, 20% fuel saving, range 14,140km) |
| Q10 | Airbus A350-900 XWB (315 seats, $90M, 25% fuel saving, range 15,000km) |
| Q12 | Airbus A320neo (180 seats, $28M, 18% fuel saving) + Airbus A220-300 (130 seats, $22M) |
| Q14 | Boeing 737 MAX 8 (178 seats, $26M, 14% fuel saving) |
| Q16 | Boeing 777X-9 (426 seats, $180M, 12% saving) |
| Q17 | Airbus A321XLR (220 seats, $32M, range 8,700km — opens transatlantic single-aisle routes) |

### 6.3 Flash Deal — Q13 Special Mechanic
- Announcement: Admin triggers the Flash Deal event at Q13 start
- 20 planes total across ALL teams — first-come-first-served
- Platform shows live counter: "X of 20 planes remaining"
- Per-plane pricing: $4M deposit, $1.7M/year fuel saving
- 30-minute timer (admin-triggered countdown)
- When pool reaches 0: remaining teams see "Aircraft fully committed" message
- Teams who committed: aircraft arrive Q14
- Admin can adjust pool size in admin portal

### 6.4 Depreciation (Applied Automatically Each Quarter Close)
```
passenger_aircraft_book_value(n) = purchase_price × (0.9875)^n
  floor = purchase_price × 0.10
cargo_aircraft: same formula
eco_upgrade_book_value(n) = upgrade_cost × (0.975)^n, floor = 0
quarterly_depreciation_charge = book_value(n-1) - book_value(n)
  — shown in P&L as "Depreciation" line item
  — reduces Net Equity accordingly
```

### 6.5 Aircraft Decommissioning
- Planes can be decommissioned via the fleet management view
- Decommissioned planes exit service next quarter
- Book value at decommission = proceeds if sold (admin sets market for second-hand aircraft)
- Admin can force-decommission any plane (incident, age, regulatory)
---

## 7. BOARD DECISIONS — 18 SCENARIOS

Each scenario appears as an interactive decision card at the start of the designated quarter. Teams read the scenario, review options, and submit their choice. Choices are locked on submission. The platform applies the game effects automatically at quarter close (using the engineering spec JSON defined in the facilitator guide). Some scenarios have time limits enforced by visible countdowns.

### 7.1 Scenario Timing and Placement

| Scenario | Title | Quarter | Time Limit | Notes |
|----------|-------|---------|------------|-------|
| S1 | The Ghost Fleet | Q4 | 30 min | |
| S2 | War in the Corridor | Q8 | 30 min | |
| S3 | The Flash Deal | Q13 | 30 min | Shared pool mechanic + countdown |
| S4 | The Oil Gamble | Q3 | 30 min | Plot twist applied at Q4 close |
| S5 | The Government Lifeline | Q6 | 30 min | Issues Gov Board Card flag in DB |
| S6 | The Rate Window | Q10 | 30 min | Dynamic numbers from team state |
| S7 | The Hungry Neighbour | Q9 | 30 min | |
| S8 | The Political Favour | Q11 | 30 min | |
| S9 | The Blue Ocean | Q16 | 30 min | |
| S10 | The World Cup Bet | Q2 | Bid deadline | Blind bid + pitch score (admin inputs pitch score after L6) |
| S11 | The Olympic Play | Q7 | 30 min | |
| S12 | The Brand Grenade | Q18 | 30 min | Plot twist applied later same quarter |
| S13 | The Digital Gamble | Q15 | 30 min | Gov Board Card may block Option A |
| S14 | The Talent Heist | Q12 | 30 min | Simultaneous with L2 — admin inputs L2 outcomes |
| S15 | The Recession Gamble | Q14 | 30 min | Gov Board Card may block Option A. Plot twist at Q16 |
| S16 | The Moscow Signal | Q5 | 30 min | Lock-in period selection (1–4 quarters) |
| S17 | The Green Ultimatum | Q17 | 30 min | |
| S18 | The Cocoa Crisis | Q9 | 30 min | Second decision in Q9 alongside S7 |

### 7.2 Cascading Flags (Database-Level)
These flags are set in the database when certain decisions are made and affect future scenario options:

| Flag | Set When | Effect |
|------|----------|--------|
| `gov_board_card` | S5 option A or B accepted | Blocks S13 Option A and S15 Option A for this team |
| `redundancy_freeze` | S5 option A | Prevents involuntary redundancy for 2 quarters |
| `trusted_operator` | S1 option A | +5 Brand Pts bonus per quarter for 3 quarters, unlocked card |
| `modern_fleet` | 10+ new-generation planes owned | +10% ops efficiency |
| `aging_fleet` | 0 new planes ordered at Q13 | +$15M maintenance cost per quarter |
| `safety_leader` | S16 option A (before Moscow Signal) | Government goodwill, regulatory benefit |
| `reactive_airline` | S16 option C | -10 reputation permanently |
| `anti_environment` | S17 option D failed | Permanent -15 Brand Pts flag |
| `green_leader` | S17 option C | ESG multiplier end-game scoring |
| `people_first` | S13 option C | +10 Brand Pts multiplier, loyalty benefit |
| `premium_airline` | S11 option A | +8 Airline Value multiplier end-game |
| `global_brand` | S10 winner | World Cup exclusivity Q10–Q12 |
| `cargo_division_sold` | S5 option D | Disables cargo revenue permanently |
| `talent_shortage` | S15 option A + early recovery twist | -10 Ops Pts for 2 quarters, $80M rehire cost |
| `trusted_employer` | S15 option C | Talent acquisition advantage, full Q16 recovery |
| `distracted_airline` | S9 option C | -5 Ops Pts for 2 quarters |

### 7.3 Plot Twist Mechanics
Certain scenarios have plot twists revealed at a specified future quarter. Admin controls when the twist is revealed (via admin portal). The system holds the outcome in state until the designated quarter, then automatically applies it at quarter close.

| Scenario | Twist Trigger Quarter | What Changes |
|----------|----------------------|-------------|
| S4 Oil Gamble | Q4 close | OPEC drop — teams on C or D benefit, A teams overpay |
| S12 Brand Grenade | Same quarter (30 min later) | Ambassador cleared — A teams penalised, D teams rewarded |
| S15 Recession Gamble | Q16 close | Recession ends early — mass redundancy teams pay rehire costs |
| S16 Moscow Signal | Q6 open | False alarm — summer surge, locked teams miss it |

---

## 8. WORLD NEWS SYSTEM

### 8.1 Mechanics
- 5 headlines per quarter, pre-loaded in the database for all 20 quarters
- Displayed at the start of each quarter, before teams make decisions
- Each headline has: impact type (tourism/business/cargo/ops/brand/fuel/none), headline text, detail text
- Impact effects are applied automatically at quarter close (based on the engineering spec)
- Admin can override, modify, or add custom news items per quarter

### 8.2 News Impact Application
When a news item has a game impact, the effect is applied at the quarter close processing cycle:
- City demand adjustments (multiplied by growth rate and world events)
- Brand Points changes
- Ops cost adjustments
- Fuel index changes

### 8.3 Key News Events by Quarter (see full World News tab in facilitator HTML for complete list)
- Q3: FIFA President golf/BMW clue (NO IMPACT — hidden clue for L6)
- Q5: Moscow Signal — triggers S16 decision
- Q6: False alarm reveal — applies S16 twist
- Q10: World Cup kicks off — Official Partner team gets 100% load factor Q10+Q11, 50% bonus Q12
- Q13: Recession declared — applies baseline demand reduction per city
- Q17: Carbon levy announced — triggers S17 decision
- Q18: Brand Grenade — triggers S12 decision

---

## 9. QUARTER PROCESSING CYCLE

When the admin closes a quarter, the following operations run in sequence:

```
1. Lock all submissions (decisions, route changes, aircraft orders)
2. Apply world news effects to city demand tables
3. Apply scenario decision effects (immediate effects from JSON spec)
4. Check and apply plot twist reveals (if twist_quarter === current_quarter)
5. Apply quarterly operations sliders (brand pts, loyalty %, ops pts, cost impacts)
6. Apply slider compounding multipliers (if 3+ consecutive quarters at same level)
7. Calculate route demand (per route, per airline) using demand formula
8. Calculate airline attractiveness per route
9. Calculate market share per airline per route
10. Calculate occupancy per airline per route
11. Calculate quarterly revenue (pax revenue + cargo revenue + other)
12. Calculate quarterly costs (fuel, staff, marketing, service, slots, hub, maintenance, interest, depreciation)
13. Apply depreciation to all fleet assets
14. Apply interest charges on all debt
15. Calculate Net Profit/Loss
16. Update cash balance
17. Apply deferred events (probability-based — dice roll equivalent for incident cards, risk events)
18. Update Brand Value components and calculate final Brand Value score
19. Update Customer Loyalty %
20. Update Airline Value (= Net Equity from balance sheet)
21. Update leaderboard
22. Unlock next quarter (if admin triggers manually or automatically)
23. Notify all teams: "Q[n] complete. Q[n+1] is now open."
```

### 9.1 Probability-Based Events
For scenarios with probability-based outcomes (e.g., S1 option C — 30% incident card), the system uses a seeded random draw at quarter close. Admin can override any random outcome via admin portal before closing the quarter.

---

## 10. ADMIN PORTAL

The admin portal is a separate interface (admin.skyforce.ican / protected route) with full control over every aspect of the simulation.

### 10.1 Game Management

**Simulation Control**
- Create/configure new simulation run (name, date, number of teams, number of quarters)
- Start / pause / resume simulation
- Open quarter: makes the quarter active for all teams
- Close quarter: triggers full quarter processing cycle (with preview before executing)
- Manually advance to a specific quarter (for testing or recovery)
- Reset a team's decisions for the current open quarter
- Reset the entire simulation to Q1

**Quarter Configuration**
- Override or edit any world news item for any quarter before it's revealed
- Add custom news items to any quarter
- Configure which scenarios appear in which quarter
- Enable/disable time limits per scenario
- Set timer durations per scenario
- Trigger the Flash Deal pool mechanic (set pool size, start countdown)
- Trigger plot twist reveals manually or auto-schedule them

### 10.2 Team Management

**Per-Team Controls**
- View full P&L, balance sheet, fleet, routes for any team in real time
- Edit any financial field:
  - Cash balance (add/deduct)
  - Total debt (add/modify/remove)
  - Current quarter interest rate for a team
  - Brand Points (add/deduct/set)
  - Ops Points (add/deduct/set)
  - Customer Loyalty % (set)
  - Airline Value (override)
  - Revenue this quarter (adjust)
  - Cost this quarter (adjust)
- Set/clear any cascade flag (gov_board_card, aging_fleet, etc.)
- Set/clear any card (trusted_operator, modern_fleet, etc.)
- Apply a Reputation Event (with points impact)
- Apply Live Simulation outcomes (points, financial impacts, cards)
- Reset a team's scenario decision for the current quarter

**Fleet Controls**
- Add aircraft to a team's fleet (type, quantity, book value, owned/leased)
- Decommission aircraft (immediate or next quarter)
- Set a plane as "out of commission" (simulates incident or maintenance ground)
- Adjust book value of any aircraft
- Mark fleet as "Modern" or "Aging" (bypasses standard calculation if needed)

**Route Controls**
- Open or close routes for any team
- Adjust occupancy rate for a specific route (override calculation)
- Add or remove landing slots for a team at any airport
- Set custom revenue for a route this quarter

**Loan/Capital Controls**
- Issue emergency capital injection to a team
- Create a loan at a custom interest rate
- Mark a loan as government-backed (Gov Board Card mechanic)
- Set team's effective borrowing rate override

### 10.3 Scenario Administration

**Per-Scenario Controls**
- Override a team's scenario decision (change their submitted answer)
- Override the outcome of a probability event (e.g., force S1 option C incident to trigger for one team)
- Set/delay a plot twist reveal
- Preview what the quarter close will do before executing it
- Apply scenario effects manually (without going through full quarter close)

**Live Simulation Outcome Entry**
All live simulation impacts are entered here — the platform does not run live simulations. Admin enters:

For each team, per live simulation:
- Brand Points awarded/deducted
- Cash impact (if any)
- Ops Points impact
- Customer Loyalty impact
- Cards awarded (e.g., "Integrity Leader", "Maverick", "Trusted Employer")
- MVP Points per individual (stored separately for end-game awards)
- Any scenario cascade flag triggered by the live sim
- Free text note (for debrief reference)

Live Simulation inputs available in admin per simulation:

| L0 Brand Building | L1 Strike | L2 Talent Heist | L3 Whistleblower | L4 Podium | L6 Elevator | L7 Crisis Ops |
|---|---|---|---|---|---|---|
| Rank (1–5) per team | Deal terms per team | CEO bid submitted | CEO score (5 dims) | Pitch score (5 dims) | Pitch score (5 dims) | Decision per team per case |
| Brand pts multiplier | Deal financial impact | Exec outcome per team | Brand/Ops impact | Brand/cash impact | FIFA score | Financial impact per case |
| Cash injection amount | Brand pts impact | Ops impact | MVP pts | MVP pts | MVP pts | MVP pts |
| Notes | Gov relief (if dead-stop) | | Notes | Notes | Notes | Notes |

### 10.4 World Cup Sponsorship (S10) Resolution
After L6 (elevator pitch), admin enters:
- Each CMO's pitch score (5 dimensions × 5 pts max + optional 3 pt BMW/golf bonus)
- Platform already has each team's sealed bid from Q2
- System calculates: pitch_score_scaled (0–10) × 0.50 + commercial_score (0–10) × 0.50
- Admin confirms winner → system applies 100% load factor Q10+Q11, 50% bonus Q12, brand pts, revenue uplift
- Admin confirms runner-up and others → system applies their outcomes

### 10.5 Aircraft Market Administration

**Global Aircraft Market**
- Set availability (yes/no) for each aircraft type per quarter
- Set market price for each aircraft type (adjustable)
- Set lease rate for each aircraft type
- Enable/disable eco-engine upgrade availability
- Configure Flash Deal: pool size, discount %, deposit amount, timer duration
- View live pool count during Flash Deal

**Second-Hand Market** (optional feature)
- Admin can open a secondary market for used planes
- Set prices for decommissioned planes
- Assign available second-hand planes

### 10.6 Fuel Market Controls
- Set the fuel index for the current quarter (or any future quarter)
- Apply a fuel spike (immediate or scheduled)
- Reverse a fuel spike
- Apply S4 Oil Gamble twist (OPEC drop — admin triggers this at Q4 close)
- Configure each team's fuel hedging status and price per their S4 decision

### 10.7 Borrowing Rate Controls
- Set the base interest rate for the current and upcoming quarters
- Override a specific team's effective borrowing rate
- Set rate history (displayed in timeline)

### 10.8 Leaderboard & Scoring Controls
- View Brand Value breakdown per team (all components visible to admin)
- Manually adjust any component score
- Override final Brand Value
- Assign MVP points per individual (independent of team Brand Value)
- Configure end-game awards:
  - Best Team Award: based on highest Brand Value at Q20
  - MVP Award: based on highest individual competency score (cumulative L0–L7)
- Generate end-game report (PDF or printable)

### 10.9 System-Wide Controls
- Push a notification to all teams ("Q7 is now open")
- Push a targeted message to one team
- Broadcast an announcement to all teams' dashboards
- Enable/disable time limits globally
- Enable/disable the leaderboard (hide from teams during sensitive periods)
- Lock a specific team's ability to submit (if they're in a live sim offline)
- Unlock all submissions (for recovery)
- View full audit log (every decision, submission, admin action, with timestamp)

### 10.10 Admin Dashboard Analytics
- Real-time: all teams' cash balance, Brand Value, decisions submitted this quarter
- Quarter snapshot: revenue, costs, profit by team
- Comparative: routes per team, fleet size per team, average occupancy
- Historical: Brand Value trajectory chart all teams Q1–Q20
- Individual: full decision history per team
- Live Sim tracker: which teams have been through which simulations, scores

---

## 11. DATA MODEL (SUPABASE SCHEMA OVERVIEW)

### Core Tables

**simulations** — one row per simulation run
- id, name, status (setup/active/completed), current_quarter, created_at, config (JSON)

**teams** — 5 rows per simulation
- id, simulation_id, team_name, airline_name, airline_logo_url, hub_airport_code, password_hash, color_hex

**team_financials** — one row per team per quarter (snapshot at close)
- id, team_id, quarter, cash, total_debt, total_revenue, total_costs, net_profit, brand_pts, ops_pts, customer_loyalty_pct, brand_value, airline_value

**aircraft** — one row per plane per team
- id, team_id, aircraft_type, status (active/ordered/grounded/leased), purchase_price, book_value, purchase_quarter, acquisition_type (buy/lease), lease_quarterly_payment, eco_upgrade (bool), eco_upgrade_cost, eco_upgrade_quarter

**routes** — one row per active route per team
- id, team_id, origin_city_code, destination_city_code, aircraft_ids (array), daily_frequency, pricing_tier, status (active/pending/closed), open_quarter, quarterly_slot_cost, quarterly_revenue, avg_occupancy

**scenarios** — master table of all 18 scenarios with full option definitions (JSON)

**team_scenario_decisions** — one row per team per scenario
- id, team_id, scenario_id, quarter, decision (A/B/C/D/E), submitted_at, locked (bool), lock_in_quarters (for S16), plot_twist_applied (bool)

**team_flags** — key-value table for cascade flags per team
- id, team_id, flag_name, value, set_at_quarter

**city_demand** — one row per city
- id, city_name, code, region, tier, amplifier, base_tourism, base_business, annual_tourism_growth, annual_business_growth, notes

**world_news** — pre-loaded 100 rows (5 per quarter × 20 quarters)
- id, quarter, headline, impact_type, detail, auto_effect_json

**live_sim_outcomes** — admin-entered per team per sim
- id, team_id, sim_id, brand_pts_delta, cash_delta, ops_pts_delta, loyalty_delta, cards_awarded (array), mvp_pts_per_individual (JSON), notes, entered_at, entered_by

**aircraft_market** — per-quarter availability and pricing
- id, quarter, aircraft_type, available (bool), buy_price, lease_quarterly, eco_upgrade_cost, notes

**fuel_index** — per-quarter fuel index values
- id, quarter, fuel_index, admin_override (bool)

**admin_logs** — audit trail
- id, admin_user, action, target_team_id, details (JSON), created_at

**quarterly_ops_submissions** — per team per quarter
- id, team_id, quarter, staff_slider, marketing_slider, food_slider, gifts_slider, rewards_slider, submitted_at, locked

---

## 12. TECHNICAL IMPLEMENTATION NOTES

### 12.1 Realtime
Use Supabase Realtime subscriptions for:
- Leaderboard updates when admin closes a quarter
- Flash Deal pool counter (live updates across all 5 teams simultaneously)
- Admin-pushed notifications appearing on team dashboards
- Quarter status changes (open → closed → next open)

### 12.2 Map Implementation
Recommended: **Mapbox GL JS** (free tier sufficient for 5 concurrent users per session)
- Base style: light/minimal (matches ICAN aesthetic)
- Custom layer: cities as GeoJSON points, styled by tier
- Custom layer: routes as curved arcs (great-circle paths), styled by team + performance
- Interactive: click events on cities and routes
- Route drawing mode: user clicks two cities → confirms route → submits to backend

Alternative if Mapbox is too costly: **Leaflet + CartoDB Positron tiles**

### 12.3 Authentication
- 5 team accounts (email + password per team)
- 1 admin account (separate, elevated access)
- Supabase Auth with Row-Level Security
- Teams can only read/write their own data
- Admin bypasses RLS

### 12.4 Time Limit Enforcement
- Countdown timers displayed client-side (accurate to second)
- When timer expires, auto-submit is triggered if decision not yet submitted (assigns worst outcome)
- Server-side validation of submission timestamp against quarter open timestamp + time limit
- Admin can pause/extend timers

### 12.5 Quarter Processing
Quarter close processing should run as a Supabase Edge Function or Next.js API route. It is a sequential transaction — all steps run atomically. If any step fails, the quarter remains open and admin is notified.

Recommended approach:
1. Admin clicks "Preview Quarter Close" → system runs dry-run and shows all changes before committing
2. Admin reviews and confirms
3. System executes all changes in a single Postgres transaction
4. On success: quarter status → closed, next quarter → open

---

## 13. GAME START SEQUENCE

### 13.1 Before Q1 Opens
- Admin creates simulation, configures teams, sets passwords
- Teams log in and see: "Simulation begins soon. Your airline has $150M seed capital. Q1 will open when your facilitator starts the session."
- No decisions, no map, no fleet — just the onboarding screen showing the rules

### 13.2 Q1 Brand Building Session (L0)
- Admin opens Q1
- Teams see: Brand Building form
  - Step 1: Assign roles (within the platform — each team member selects their role, or facilitator enters)
  - Step 2: Airline name, tagline, logo (upload or text-based)
  - Step 3: Hub airport selection (map-based click or dropdown) — blind bid modal if conflict
  - Step 4: Strategy declaration (market focus: passenger/cargo/balanced, geographic priority)
  - Step 5: Pricing tier selection (budget/mid/premium/ultra)
  - Step 6: Salary philosophy (below/at/above market)
  - Step 7: Marketing budget level (low/medium/high/aggressive)
  - Step 8: CSR theme (environment/community/employees/none)
  - Step 9: Team presentation slides (optional upload or freeform text)
  - Submit all → form locked
- Admin inputs presentation scores per team (1–5 per dimension × 5 dimensions)
- System calculates ranking and cash injections
- Admin confirms → cash injected, brand pts multipliers applied, teams notified

### 13.3 Q2 Onwards
- Q2 opens with cash injection applied
- Teams can now order aircraft (arrive Q3)
- Teams can plan routes (active Q3)
- S10 World Cup Bet appears as first board decision (bid submission only — pitch happens at L6 offline)
- All other quarterly operations available

---

## 14. 20-QUARTER TIMELINE SUMMARY

| Quarter | ~Game Year | Key Events | Board Decisions | Live Sims |
|---------|-----------|------------|-----------------|-----------|
| Q1 | 2000 Q1 | Market opening | — | L0 Brand Building |
| Q2 | 2001 Q1 | World Cup announcement | S10 World Cup Bet | — |
| Q3 | 2002 Q3 | Fuel spike Q1 | S4 Oil Gamble | — |
| Q4 | 2004 Q4 | Fuel elevated + tech summit | S1 Ghost Fleet | L1 Strike (between Q4–Q5) |
| Q5 | 2005 Q1 | Moscow Signal | S16 Moscow Signal | — |
| Q6 | 2006 Q2 | FALSE ALARM + summer surge | S5 Gov Lifeline | — |
| Q7 | 2007 Q3 | Olympics + war | S11 Olympic Play | L6 Elevator (end of Q7), L3 Whistleblower (between Q7–Q8) |
| Q8 | 2008 Q4 | War in corridor | S2 War in Corridor | L7 Crisis Ops (between Q8–Q9) |
| Q9 | 2010 Q1 | Recovery + Cocoa spike | S7 Hungry Neighbour, S18 Cocoa Crisis | — |
| Q10 | 2011 Q2 | World Cup! | S6 Rate Window | L4 Podium (between Q10–Q11) |
| Q11 | 2012 Q3 | Conflict + rates | S8 Political Favour | — |
| Q12 | 2014 Q4 | Rate hike | S14 Talent Heist | L2 Talent Heist Live (simultaneous) |
| Q13 | 2015 Q1 | Recession + rates peak | S3 Flash Deal | L5 Project Aurora (between Q13–Q14) |
| Q14 | 2016 Q2 | Recession deepens | S15 Recession Gamble | — |
| Q15 | 2018 Q3 | Olympics + stimulus | S13 Digital Gamble | — |
| Q16 | 2019 Q4 | Recession ends | S9 Blue Ocean | — |
| Q17 | 2020 Q1 | Carbon levy | S17 Green Ultimatum | — |
| Q18 | 2022 Q2 | Full recovery | S12 Brand Grenade | — |
| Q19 | 2023 Q3 | New corridors | (world events only) | — |
| Q20 | 2025 Q4 | Final quarter | S18 (removed — now Cocoa was S18 at Q9) | Final scoring |

**Note on S18:** The Cocoa Crisis (S18) runs at Q9. Q20 has no board decision scenario — it is purely world events + final scoring + investor presentation (offline).

---

## 15. SCORING & AWARDS

### 15.1 Best Team Award — Highest Brand Value at Q20
Brand Value at Q20 close determines the winner. All quarterly processing has been applied. No manual adjustments after Q20 close.

### 15.2 MVP Award — Highest Individual Competency Score
Accumulated across L0–L7 (all live simulations). Admin enters individual scores per simulation. The platform maintains a per-individual tally (CEO, CFO, CMO, CHRO of each team = 20 individuals total).

| Live Sim | Max Individual Pts | Role Most Affected |
|----------|-------------------|-------------------|
| L0 Brand Building | 10 | All (team × individual contribution) |
| L6 FIFA Elevator | 28 (with BMW bonus) | CMO only |
| L1 The Strike | 15 per rep | 2 reps per side |
| L4 The Podium | 25 | CEO only |
| L2 Talent Heist | 12 | CEO (bid decision) |
| L3 Whistleblower | 15 | CEO only |
| L7 Crisis Ops | 10 | CMO + CFO |
| L5 Project Aurora | 28 (with Integrity card) | CEO primarily |

**Special MVP Cards (entered by admin):**
- "Maverick" card (L5 Route D taken): MVP points equalised to current leader
- "Integrity Leader" card (L5 Route D disclosed and refused): +12 personal pts
- "Efficient Leadership" card (L1 deal struck <15 min, low concessions): +5 Ops Pts team, +5 personal

---

## 16. 100-CITY DATABASE (KEY DATA)

Full city list with daily demand figures at Q1, amplifiers, and growth rates. See facilitator HTML document (World News → City Demand tab) for complete table. Below are the 10 highest-demand cities for reference:

| City | Code | Tourism/day | Business/day | Amplifier | Tier |
|------|------|-------------|-------------|-----------|------|
| London | LHR | 230 | 220 | 2.0× | 1 |
| New York | JFK | 220 | 240 | 2.0× | 1 |
| Paris | CDG | 220 | 200 | 2.0× | 1 |
| Singapore | SIN | 205 | 215 | 2.0× | 1 |
| Dubai | DXB | 210 | 195 | 2.0× | 1 |
| Tokyo | NRT | 210 | 205 | 1.8× | 1 |
| Hong Kong | HKG | 200 | 210 | 1.8× | 1 |
| Amsterdam | AMS | 190 | 200 | 1.8× | 1 |
| Los Angeles | LAX | 200 | 180 | 1.8× | 1 |
| Bangkok | BKK | 195 | 155 | 1.5× | 2 |

**Amplifier rule:** Always use the LOWER amplifier of the two cities on a route. New York (2.0×) + London (2.0×) = 2.0×. New York (2.0×) + Muscat (1.0×) = 1.0×. This prevents routes between two mega-hubs from artificially inflating demand beyond what the market supports.

**Supply/demand competition:** If total airline capacity on a route exceeds total route demand, occupancy drops proportionally. If undersupplied, all airlines on route achieve near-100% occupancy. This creates real competitive tension in route planning.

---

## 17. PRICING MECHANICS

### 17.1 Pricing Tiers
Teams set a pricing philosophy in Q1 (can be changed per-route in route management):

| Tier | Price vs. Market | Revenue Effect | Demand Effect |
|------|-----------------|---------------|--------------|
| Budget | −20% | Revenue per seat reduced | Attracts higher volume (attractiveness score boost) |
| Standard | Market rate | Baseline | Baseline |
| Premium | +25% | Revenue per seat higher | Lower volume (price sensitivity applies) |
| Ultra-Premium | +60% | Highest per-seat revenue | Lowest volume — suits low-volume luxury routes |

### 17.2 Price Sensitivity in Attractiveness Formula
Price score = (avg_route_price / this_airline_price) × 100

- If your price = average: price_score = 100
- If 20% cheaper: price_score = 125 → significant attractiveness boost
- If 25% more expensive: price_score = 80 → attractiveness reduction
- Price has 45% weight in attractiveness → it matters most

---

## 18. KEY BUSINESS RULES & CONSTRAINTS

1. **No planes in Q1** — teams cannot order aircraft until Q2. Aircraft ordered in Q2 arrive Q3. Operations begin Q3.
2. **No shared hubs** — two teams cannot use the same hub. Blind bid resolves conflicts.
3. **Decisions are final once submitted** — only admin can override.
4. **Gov Board Card blocks options** — S13-A and S15-A are unavailable to teams carrying this flag (greyed out in the UI with explanation).
5. **Operating lease minimum** — 4 quarters. Early termination = 2-quarter penalty.
6. **Maximum borrowing** — (Airline Value × 60%) − Current Total Debt. Cannot borrow beyond this.
7. **Time-limited decisions** — auto-submit worst outcome if team fails to submit in time.
8. **Flash Deal pool** — 20 planes across 5 teams. Live counter. First-come-first-served. Admin can adjust pool.
9. **S16 Moscow Signal lock-in** — teams committing to Option A or B for 3+ quarters cannot restore operations during that period, even when the false alarm reveals at Q6.
10. **World Cup capacity guarantee** — winning team gets 100% occupancy Q10 + Q11, 50% demand uplift Q12, regardless of actual capacity/demand ratio.
11. **Route slots** — if a team closes a route, slots may be permanently lost (airport authority re-assigns them). Admin controls slot reinstatement.
12. **Depreciation** — applied automatically every quarter. Cannot be turned off. Book value used in balance sheet calculations.
13. **Fuel hedging** — S4 decision locks a specific fuel rate for a specific period. Platform enforces the locked rate override on fuel cost calculations for that team during the locked period.
14. **One hub per team at start** — secondary hubs can be added at double terminal fee from Q3 onward.
15. **Live sim impacts** — admin portal only. Platform never auto-applies live sim impacts.
---

## 19. UX / INTERFACE SPECIFICATIONS

### 19.1 Navigation Structure
```
/                       → Login (team or admin)
/dashboard              → Team: Main Dashboard
/dashboard/map          → Team: Interactive World Map (routes + cities)
/dashboard/fleet        → Team: Fleet Management
/dashboard/routes       → Team: Route Management
/dashboard/financials   → Team: P&L, Balance Sheet, Cash Flow
/dashboard/decisions    → Team: Current quarter board decisions
/dashboard/news         → Team: World News (current quarter)
/dashboard/leaderboard  → Team: Standings
/dashboard/ops          → Team: Quarterly Ops submission form
/admin                  → Admin: Login
/admin/dashboard        → Admin: Overview of all teams
/admin/simulation       → Admin: Quarter control, game config
/admin/teams/[id]       → Admin: Per-team full management
/admin/scenarios        → Admin: Scenario management, twist triggers
/admin/market           → Admin: Aircraft market, fuel index
/admin/live-sims        → Admin: Live simulation outcome entry
/admin/awards           → Admin: MVP scoring, final awards
/admin/logs             → Admin: Audit log
```

### 19.2 Map Component Requirements

**Cities Layer:**
- 100 GeoJSON points, each with: code, name, region, tier, amplifier, base_tourism, base_business
- Marker size by tier: T1 = 14px, T2 = 10px, T3 = 7px, T4 = 5px
- Marker color: default grey; highlight on hover with tooltip
- Own hub: team-color ring, slightly larger, always visible label
- Rival hubs: small dot in rival team color

**City Tooltip (on hover):**
```
[City Name] · [Airport Code]
Tier [X] Airport
Tourism demand: [X] passengers/day
Business demand: [X] passengers/day
Daily combined: [X]
Airport amplifier: [X]×
Hub terminal fee: $[X]M/quarter
Landing fee: $[X]K/movement
```

**Routes Layer:**
- Curved arcs (great-circle approximation) between connected cities
- Own routes: ICAN Teal (#00C2CB), 2px stroke, animated flow (dash animation)
- Profitable own routes (>70% occupancy): green glow border
- Underperforming own routes (<50%): orange glow
- Loss-making routes: red glow
- Competitor routes: light grey, 1px, no animation, 40% opacity

**Route Tooltip (on click):**
```
[Origin] → [Destination]
Aircraft: [type]
Frequency: [X] departures/day
Occupancy: [X]%
Daily passengers: [X]
Quarterly Revenue: $[X]M
Quarterly Slot Cost: $[X]M
Competitors on route: [N] (names shown if visible)
```

**Add Route Flow:**
1. User clicks "Add Route" button or clicks an unconnected city on the map
2. Route drawing mode activates: cursor shows crosshair + magnet icon
3. User clicks origin city → confirmation dot appears
4. User clicks destination city → arc draws as preview
5. Modal opens: "Confirm Route — [Origin] to [Destination]"
   - Select aircraft to assign (from owned fleet, shows capacity + range warning if needed)
   - Daily frequency (1–10)
   - Pricing tier
   - Quarterly slot cost preview (auto-calculated)
   - Quarterly revenue estimate (auto-calculated from demand model)
   - Estimated occupancy (auto-calculated)
6. Confirm → route submitted as Q+1 pending
7. Map shows route as dashed (pending) until next quarter

### 19.3 Dashboard Design Tokens

Consistent with ICAN brand system:

```css
/* Colors */
--teal: #00C2CB;
--teal-dark: #02939B;
--charcoal: #545454;
--white: #FFFFFF;
--soft: #f4fafc;
--border: #ddeaec;
--text: #1a2a2b;
--muted: #6b8a8c;

/* Semantic */
--positive: #1e7a5e;
--negative: #D43D25;
--warning: #7a6e00;
--neutral: #545454;

/* Typography */
--font: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'Courier New', Courier, monospace;

/* Spacing */
--radius: 8px;
--radius-lg: 12px;
```

### 19.4 Key UI Components

**Metric Card:**
- Label (small caps, muted)
- Value (large, bold, brand color)
- Delta vs. last quarter (green/red with arrow)
- Mini sparkline (last 5 quarters)

**Decision Card:**
- Header: scenario number, title, quarter
- Context text (full scenario summary)
- Options A–E (or as applicable) as radio button cards with label + detail
- Selected option highlighted in teal
- Timer (countdown) in top-right corner if time-limited
- Submit button (disabled until option selected; greys out after submission)
- Status badge: "Open" / "Submitted" / "Locked"

**News Item:**
- Impact tag (color-coded: teal=all, orange=tourism, purple=business, etc.)
- Headline text
- Detail text (expandable)
- "No Impact" tag for colour/entertainment news

**Aircraft Card (in market):**
- Aircraft type name + generation
- Seat breakdown: F/C/Y/Total
- Range, fuel burn
- Fuel efficiency rating bar
- Buy price vs. lease/quarter
- Eco upgrade cost
- "Order" button → confirmation modal with financing selection

**Route Performance Widget:**
- Small map showing origin→destination
- Occupancy gauge (circular, color-coded)
- Revenue/cost/profit summary
- Competitor count badge

---

## 20. SCENARIO ENGINEERING SPECS (FULL LIST)

Below are the complete game effect specifications for all 18 scenarios, formatted for direct use in the quarter processing engine. All monetary values in USD. Effects marked `[annual]` are divided by 4 to get quarterly cost.

### S1 — The Ghost Fleet (Q4)
```json
{
  "A_self_report": {
    "cash": -180000000,
    "brand_pts": 15,
    "ops_pts": 10,
    "set_flag": "trusted_operator",
    "deferred_card": "trusted_operator_q7"
  },
  "B_internal_review": {
    "cash": -45000000,
    "brand_pts": -5,
    "deferred_event": {
      "probability": 0.425,
      "trigger_quarter": "Q5",
      "on_trigger": {"cash": -40000000, "brand_pts": -25}
    }
  },
  "C_continue_flying": {
    "deferred_event": {
      "probability": 0.30,
      "trigger_quarter": "Q5",
      "on_trigger": {
        "aircraft_lost": 1,
        "cash_pct": -0.20,
        "cash_cap": -150000000,
        "brand_pts": -50,
        "ops_pts": -20
      }
    }
  },
  "D_quiet_grounding": {
    "cash": -60000000,
    "brand_pts": -5,
    "ops_pts": -5,
    "deferred_event": {
      "probability": 0.40,
      "trigger_quarter": "Q5",
      "on_trigger": {"execute": "A_self_report_effects", "brand_pts_additional": -15}
    }
  },
  "loyalty_deltas": {"A": 3, "B": -1, "C": -5, "D": -2}
}
```

### S2 — War in the Corridor (Q8)
```json
{
  "A_reroute": {"annual_revenue_delta": -18000000, "brand_pts": 8, "ops_pts": -5},
  "B_continue": {
    "brand_pts": -5,
    "deferred_event": {"probability": 0.25, "trigger_quarter": "Q9",
      "on_trigger": {"cash": -30000000, "brand_pts": -20, "ops_pts": -10}}
  },
  "C_suspend": {"annual_revenue_delta": -95000000, "brand_pts": 10, "ops_pts": -10,
    "set_flag": "route_slots_lost"},
  "D_insurance": {
    "cash": -8000000,
    "brand_pts": -8,
    "deferred_event": {"probability": 0.25, "trigger_quarter": "Q9",
      "on_trigger": {"cash": -30000000, "brand_pts": -20}}
  },
  "loyalty_deltas": {"A": 3, "B": -4, "C": 6, "D": -6}
}
```

### S3 — The Flash Deal (Q13) [Pool Mechanic — See Section 12.1]
```json
{
  "per_plane": {
    "deposit": -4000000,
    "annual_fuel_saving": 1700000,
    "ops_pts": 1
  },
  "modern_fleet_threshold": {"min_planes": 10, "ops_efficiency_bonus": 0.10},
  "aging_fleet_card": {"planes_ordered": 0, "quarterly_maintenance_cost": 15000000},
  "B_extension": {"success_probability": 0.50, "on_fail": "C_decline_effects"},
  "loyalty_deltas": {"A": 1, "B": 0, "C": -2, "D": 1}
}
```

### S4 — The Oil Gamble (Q3) — Twist at Q4 close
```json
{
  "A_12month_lock": {
    "annual_fuel_cost_fixed": 240000000,
    "ops_pts": 5,
    "twist_q4_penalty": -60000000
  },
  "B_6month_lock": {"annual_fuel_cost_fixed": 205000000},
  "C_open_market": {
    "ops_pts": -5,
    "twist_q4_benefit": 60000000
  },
  "D_50_50": {
    "annual_fuel_cost_fixed": 220000000,
    "ops_pts": 3,
    "twist_q4_benefit": 30000000,
    "structured_risk_bonus": {"condition": "team_articulated_framework", "ops_pts": 5}
  }
}
```

### S5 — The Government Lifeline (Q6)
```json
{
  "A_gov_deal": {
    "cash_next_quarter": 300000000,
    "annual_route_obligation_cost": -20000000,
    "set_flag": "gov_board_card",
    "set_flag": "redundancy_freeze",
    "redundancy_freeze_quarters": 2
  },
  "B_negotiate": {
    "cash_next_quarter": 300000000,
    "annual_route_obligation_cost": -10000000,
    "gov_walk_probability": 0.30,
    "on_walk": "must_choose_C_or_D"
  },
  "C_private_markets": {
    "cash_in_2_quarters": 200000000,
    "bridge_cost": -8000000
  },
  "D_asset_sale": {
    "cash_this_quarter": 180000000,
    "annual_cargo_revenue_removed": -30000000,
    "set_flag": "cargo_division_sold",
    "ops_pts": -10
  },
  "loyalty_deltas": {"A": 2, "B": 2, "C": 0, "D": -3}
}
```

### S6 — The Rate Window (Q10) [Dynamic — use team's actual figures]
```json
{
  "dynamic_inputs": ["team_total_debt", "team_blended_rate"],
  "formulas": {
    "new_rate": "Q10_base_rate + 0.005",
    "annual_saving": "team_total_debt × (blended_rate - new_rate)",
    "break_fee": "team_total_debt × 0.035"
  },
  "A_full_refinance": {
    "cash": "-break_fee",
    "annual_interest_saving": "+annual_saving",
    "set_flag": "efficient_capital"
  },
  "B_decline": {
    "deferred_event": {"trigger_quarter": "Q11", "rate_increase": 0.025}
  },
  "C_half_refinance": {
    "cash": "-break_fee * 0.5",
    "annual_interest_saving": "+annual_saving * 0.5"
  },
  "D_competing_offer": {
    "success_probability": 0.60,
    "on_success_rate_delta": -0.003,
    "on_fail": "B_decline_effects"
  }
}
```

### S7 — The Hungry Neighbour (Q9)
```json
{
  "A_full_acquisition": {
    "cash": -350000000,
    "debt_assumed": 180000000,
    "quarterly_drag": -20000000,
    "drag_duration_quarters": 2,
    "annual_revenue_after_drag": 50000000,
    "ops_pts": -15,
    "brand_pts": 10
  },
  "B_routes_only": {"cash": -120000000, "annual_revenue_from_q10": 80000000, "brand_pts": 5},
  "C_let_collapse": {
    "brand_pts": -5,
    "deferred_event": {"probability": 0.60, "trigger_quarter": "Q10",
      "on_trigger": {"set_flag": "routes_permanently_lost"}}
  },
  "D_codeshare": {
    "annual_revenue": 30000000,
    "ops_pts": 5,
    "deferred_event": {"probability": 0.30, "trigger_quarter": "Q11",
      "on_trigger": {"codeshare_ends": true}}
  },
  "loyalty_deltas": {"A": 3, "B": 2, "C": -2, "D": 2}
}
```

### S8 — The Political Favour (Q11)
```json
{
  "A_accept_all": {
    "annual_cost_delta": -13000000,
    "brand_pts": 15,
    "ops_pts": -8,
    "set_flag": "government_ally",
    "hub_slot_secured": true
  },
  "B_negotiate_3": {"annual_cost_delta": -11000000, "brand_pts": 8, "ops_pts": -4},
  "C_decline": {
    "brand_pts": -10,
    "ops_pts": 5,
    "deferred_event": {"probability": 0.40, "trigger_quarter": "Q13",
      "on_trigger": {"cash": -40000000, "ops_pts": -10}}
  },
  "D_seek_subsidy": {
    "success_probability": 0.40,
    "on_success": {"annual_cost_delta": 0, "brand_pts": 12},
    "on_fail": {"brand_pts": -5, "must_choose_next": true}
  },
  "loyalty_deltas": {"A": 4, "B": 2, "C": -2, "D": 3}
}
```

### S9 — The Blue Ocean (Q16)
```json
{
  "A_new_market": {
    "cash": -85000000,
    "ops_pts": -5,
    "ops_distraction_quarters": 2,
    "annual_revenue_from_q19": 150000000,
    "first_mover_end_game_bonus": 20
  },
  "B_deepen": {"cash": -40000000, "annual_revenue_from_q17": 80000000, "brand_pts": 5},
  "C_split": {"cash": -60000000, "set_flag": "distracted_airline", "ops_pts": -5},
  "D_dividend": {"cash": 40000000, "brand_pts": -5, "set_flag": "no_vision"},
  "loyalty_deltas": {"A": 4, "B": 2, "C": 1, "D": -3}
}
```

### S10 — The World Cup Bet (Q2) [Blind bid + admin pitch score entry after L6]
```json
{
  "winner": {
    "cash": "-bid_amount",
    "brand_pts": 25,
    "customer_loyalty": 5,
    "set_flag": "global_brand",
    "load_factor_override": {"q10": 1.0, "q11": 1.0, "q12_demand_bonus": 0.50}
  },
  "runner_up": {"brand_pts": 5, "customer_loyalty": 1},
  "others": {"brand_pts": -8, "customer_loyalty": -1},
  "ambush": {
    "cash": -15000000,
    "brand_pts": 8,
    "revenue_q10": 20000000,
    "legal_risk": {"probability": 0.20, "cash": -5000000, "brand_pts": -15}
  },
  "scoring_formula": {
    "pitch_score_weight": 0.50,
    "commercial_score_weight": 0.50,
    "commercial_score": "(team_bid / max_bid) × 10"
  }
}
```

### S11 — The Olympic Play (Q7)
```json
{
  "A_official": {
    "cash": -65000000,
    "brand_pts": 20,
    "loyalty_delta": 8,
    "annual_revenue": 25000000,
    "set_flag": "premium_airline",
    "end_game_multiplier": 1.08
  },
  "B_performance": {"cash": -65000000, "brand_pts": 10, "loyalty_delta": 4, "annual_revenue": 55000000},
  "C_local": {"cash": -35000000, "brand_pts": 12, "loyalty_delta": 3, "annual_revenue": 14000000},
  "D_sport": {
    "cash": -18000000,
    "card_draw": {"p40": {"brand_pts": 25, "loyalty_delta": 8}, "p60": {"brand_pts": 5, "loyalty_delta": 2}}
  },
  "E_nothing": {"brand_pts_relative": -8, "loyalty_delta": -3}
}
```

### S12 — The Brand Grenade (Q18) [Loyalty threshold affects B outcomes]
```json
{
  "loyalty_threshold_for_B": 70,
  "A_terminate": {
    "cash": -10000000,
    "brand_pts": 5,
    "loyalty_delta": -12,
    "twist": {"brand_pts": -22, "home_route_revenue_pct": -0.08}
  },
  "B_join_joke": {
    "cash": -3000000,
    "card_draw": {
      "loyalty_above_70": {"p65": "success", "p35": "fail"},
      "loyalty_below_70": {"p40": "success", "p60": "fail"}
    },
    "success": {"brand_pts": 28, "loyalty_delta": 10},
    "fail": {"brand_pts": -18, "loyalty_delta": -8}
  },
  "C_apology": {"brand_pts": 10, "loyalty_delta": 6, "twist": {"brand_pts": 15}},
  "D_redemption": {
    "cash": -8000000,
    "deferred_brand_pts": 38,
    "deferred_quarters": 2,
    "loyalty_delta": 15,
    "earned_media": 22000000
  },
  "E_silence": {
    "brand_pts": -5,
    "loyalty_delta": -5,
    "risk_event": {"probability": 0.30, "brand_pts": -18}
  }
}
```

### S13 — The Digital Gamble (Q15)
```json
{
  "prerequisite": "if gov_board_card: disable option A",
  "A_full_rollout": {
    "cash": -25000000,
    "annual_saving_from_q17": 95000000,
    "strike_risk_per_quarter": 0.30,
    "brand_pts": -10,
    "loyalty_delta": -5,
    "on_strike": {"cash": -50000000, "ops_pts": -15}
  },
  "B_phase_3": {
    "cash": -25000000,
    "annual_savings": {"q16": 30000000, "q17": 60000000, "q18": 95000000},
    "strike_risk_per_quarter": 0.10,
    "brand_pts": -3
  },
  "C_reskill": {
    "cash": -65000000,
    "annual_saving_from_q20": 95000000,
    "strike_risk_per_quarter": 0,
    "brand_pts": 15,
    "loyalty_delta": 8,
    "set_flag": "people_first"
  },
  "D_cancel": {
    "set_flag": "aging_operations",
    "competitor_advantage_note": "Competitor AI gap widens each quarter"
  }
}
```

### S14 — The Talent Heist (Q12) [Resolved with L2 outcomes from admin]
```json
{
  "note": "Resolution requires cross-referencing CEO bid from L2 with team decision",
  "A_blank_cheque": {"resolves_against_L2_bid": true},
  "B_cap_20pct": {"resolves_if_bid_below_20pct": "retained", "else": "poached"},
  "C_decline": {
    "executive_poached_if_targeted": true,
    "ops_pts_bonus": 5,
    "loyalty_delta": 2,
    "succession_bonus": {"named_successor": 5}
  },
  "D_counter_succession": {
    "resolves_against_L2_bid": true,
    "ops_pts_bonus": 10,
    "loyalty_delta": 4,
    "succession_bonus": {"credible_plan": 10}
  },
  "if_exec_poached": {"ops_pts": -8, "productivity_loss_quarters": 2},
  "if_exec_retained": {"ops_pts": 5, "morale_bonus": 5}
}
```

### S15 — The Recession Gamble (Q14) [Twist at Q16]
```json
{
  "prerequisite": "if gov_board_card: disable option A",
  "A_mass_redundancy": {
    "annual_saving": 120000000,
    "brand_pts": -20,
    "loyalty_delta": -10,
    "twist_q16": {"cash": -80000000, "set_flag": "talent_shortage", "ops_pts": -10, "recovery_quarters": 2}
  },
  "B_temp_measures": {"annual_saving": 60000000, "brand_pts": -5, "loyalty_delta": -3, "full_recovery_q16": true},
  "C_hold": {"annual_saving_elsewhere": 40000000, "brand_pts": 10, "loyalty_delta": 5,
    "set_flag": "trusted_employer", "full_recovery_q16": true},
  "D_counter_cyclical": {"cash": -30000000, "brand_pts": 15, "loyalty_delta": 8,
    "competitive_advantage_q16": 120000000}
}
```

### S16 — The Moscow Signal (Q5) [Lock-in mechanic + twist at Q6]
```json
{
  "lock_in_options": [1, 2, 3, 4],
  "per_quarter_savings": {"A": 28000000, "B": 14000000},
  "twist_q6": {
    "missed_revenue_per_locked_quarter_over_1": 65000000,
    "loyalty_impact_per_locked_quarter_over_1": -4
  },
  "C_protocols": {"cash": -1500000, "brand_pts": 5, "loyalty_delta": 2, "full_summer_capture": true},
  "D_counter": {"cash": -8000000, "competitor_bookings_captured": 55000000, "brand_pts": 15, "loyalty_delta": 8}
}
```

### S17 — The Green Ultimatum (Q17)
```json
{
  "baseline_levy": 55000000,
  "A_absorb": {"annual_cost": -55000000, "brand_pts": 10, "loyalty_delta": 4, "set_flag": "sustainability_signal"},
  "B_surcharge": {
    "revenue_neutral": true,
    "brand_pts": -8,
    "loyalty_delta": -3,
    "competitor_risk": "if_any_competitor_absorbs: brand_pts -= 10"
  },
  "C_saf_invest": {
    "cash": -80000000,
    "levy_reduction_from_q19": 0.40,
    "brand_pts": 20,
    "loyalty_delta": 8,
    "set_flag": "green_leader"
  },
  "D_legal": {
    "success_probability": 0.30,
    "on_success": {"cash": -8000000},
    "on_fail": {"cash": -8000000, "full_levy_applied": true, "set_flag": "anti_environment", "brand_pts": -15}
  }
}
```

### S18 — The Cocoa Crisis (Q9)
```json
{
  "baseline_chocolate_cost": 12000000,
  "A_pay_premium": {"annual_cost_delta": -4200000, "brand_pts": 3, "loyalty_delta": 2},
  "B_drop": {"annual_saving": 12000000, "brand_pts": -10, "loyalty_delta": -8, "ops_pts": -3, "cabin_score_drop": 0.12},
  "C_new_supplier": {"brand_pts": -5, "loyalty_delta": -3},
  "D_rebrand": {
    "annual_cost_delta": -6000000,
    "card_draw": {
      "p70": {"brand_pts": 8, "loyalty_delta": 5, "set_flag": "elevated_service"},
      "p30": {"brand_pts": -6, "loyalty_delta": -3, "set_flag": "greenwashing_perception"}
    }
  },
  "loyalty_amplification": "apply loyalty_demand_multiplier to all loyalty deltas"
}
```

---

## 21. LIVE SIMULATION SUMMARIES (FOR ADMIN REFERENCE)

All 7 live simulations are conducted offline by ICAN facilitators. The platform does not facilitate them. The admin enters outcomes. Brief descriptions below for admin reference:

**L0 — Brand Building (Q1):** All teams present their airline strategy to a panel. Scored 1–5 on 5 dimensions. Ranking determines Brand Pts multiplier (10×/7×/5×/3×/2×) and Q2 cash injection (+$80M/+$60M/+$40M/+$20M/$0).

**L1 — The Strike (Between Q4–Q5):** Bilateral negotiation. Cross-team pairings (Airline A's corporate team vs. Airline B's union reps). 30-minute negotiation at $400K/minute cost clock (only corporate team knows), tripling after minute 30. Union has hidden dead-stop minute. Government 50% relief if dead-stop triggers (union knows, corporate doesn't). Admin enters: deal terms, financial impact, brand pts, loyalty delta, any flags.

**L2 — Talent Heist Live (Q12, simultaneous with S14):** CEOs extracted to separate room. Each bids to poach one executive from a rival team. Remaining team members make S14 counter-offer decision without CEO. Resolution requires cross-referencing CEO bids with S14 decisions. Admin enters: poaching outcomes, financial impacts, executive gains/losses per team.

**L3 — The Whistleblower (Between Q7–Q8):** CEO only, one at a time. Facilitator plays a nervous junior engineer revealing forged safety sign-offs. CEO assessed on: listening, honesty about confidentiality limits, protecting the engineer, commitment to action. Admin enters: score on 5 dimensions, MVP pts per CEO.

**L4 — The Podium (Between Q10–Q11):** All CEOs present one at a time to a journalist. Order by dice roll. Audience = all non-CEO participants (16 people). Plot twist: any specific promise made in the press conference takes effect in the game. Admin logs exact verbal commitments and applies them as operational costs/constraints. Admin enters: scores per CEO, any financial/operational commitments made, MVP pts.

**L6 — The Elevator (End of Q7):** CMOs only, one at a time. 60-second elevator pitch to FIFA President (facilitator role-plays). Scored on 5 dimensions × 5 pts + 3 bonus pts if BMW/golf reference used naturally. Combined with S10 sealed bids to determine World Cup sponsorship winner. Admin enters: pitch score per CMO, winner calculated by system.

**L7 — Crisis Operations Room (Between Q8–Q9):** CMOs + CFOs separated from CEOs and CHROs. Two crisis cases, 5-minute window each: (1) No-fly zone — flight 58 min from destination, 61 min from origin, both paths cross zone; (2) Pilot on runway asking about projectile risk (1:15,750 probability, $50M partial / $400M total loss model, $1.8M ground cost). Admin enters: decisions per team, financial outcomes, incident dice roll results (if applicable), MVP pts.

**L5 — Project Aurora (Between Q13–Q14):** Room split by function (all CHROs at one table, all CMOs, all CFOs). 20 information cards. CEO receives hidden agenda card (Route D = personal MVP points but team value destroyed). Three routing options (A/B/C) with correct answer only visible when all information is assembled. Admin enters: routing decision per CEO, Route D outcomes, Maverick/Integrity Leader cards, financial impacts, MVP pts.

---

## 22. PLAYER ONBOARDING & UX FLOW

### First Login
1. Enter team email + password (provided by admin/facilitator)
2. Brief onboarding screen: "Welcome to SkyForce. You have $150M in seed capital. Your simulation begins shortly."
3. No actions available until Q1 opens

### Q1 Opens
1. Dashboard shows: Brand Building form (as described in Section 13.2)
2. Guided flow with progress bar: Step 1 of 8
3. All steps must be completed before presentation submission
4. Hub selection includes live map — click to choose, blind bid auto-triggers if conflict

### Q2 Opens (After L0 scoring)
1. Dashboard notification: "Q1 complete. Your cash injection of $[X]M has been applied. Q2 is now open."
2. Dashboard shows new cash balance
3. World News Q2 headlines visible
4. S10 World Cup Bet decision card appears
5. Aircraft market unlocked — team can now order planes
6. Route planner unlocked — team can plan Q3 routes

### Each Subsequent Quarter
1. Notification: "Q[n] is now open."
2. World news revealed (5 headlines)
3. Board decision card(s) appear if applicable — must submit before quarter close
4. Quarterly ops form available (sliders, aircraft orders, route changes)
5. Timer shown if decision is time-limited
6. Submit all → awaiting quarter close
7. Admin closes quarter → outcomes applied → notifications sent → next quarter opens

### End of Game (Q20 Close)
1. Admin closes Q20
2. All outcomes processed
3. Teams see full final dashboard: complete 20-quarter financial history, Brand Value trajectory, final ranking
4. Admin announces awards at live event

---

## 23. NOTIFICATIONS & REAL-TIME UPDATES

Using Supabase Realtime:
- Quarter opened/closed → all team dashboards update automatically
- Admin broadcast message → appears as banner notification on all dashboards
- Flash Deal pool counter → live update every 5 seconds during active Flash Deal
- Blind bid resolution → affected team(s) see immediate result
- Leaderboard → updates at quarter close (or real-time if admin chooses)
- Decision submitted by team → confirmation toast notification

Email notifications (optional, via Supabase email or Resend):
- Quarter opened
- Reminder: "Quarter closes in 15 minutes — decisions pending"
- Quarter closed — outcomes summary

---

## 24. TESTING & SIMULATION MODES

**Test Mode (Admin-Only)**
- Admin can run a "test quarter" without affecting real game state
- Preview quarter close outcomes before committing
- Reset any team state for testing
- Create a sandbox simulation separate from live simulation

**Demo Mode**
- Pre-populated with 5 fictional airlines and historical decision data
- Admin can show stakeholders the platform without affecting a live game
- All decisions pre-made, all quarters already processed

---

## APPENDIX A — WORLD NEWS COMPLETE LIST

See the SkyForce Facilitator HTML document (skyforce_r2.html) — "World News" tab — for complete 20-quarter, 100-headline world news database with full impact details.

## APPENDIX B — COMPLETE CITY DEMAND DATABASE

See the SkyForce Facilitator HTML document — "City Demand" tab — for all 100 cities with daily tourism demand, business demand, amplifiers, growth rates, and character notes.

## APPENDIX C — AIRCRAFT SPECIFICATIONS

See the SkyForce Facilitator HTML document — "Game Timeline" → "Aircraft Specifications" section — for full specs of all aircraft available across the simulation, including unlock quarters, seat configurations, range, fuel consumption, cargo capacity, pricing, and competitive advantages.

## APPENDIX D — 18 SCENARIO TEXTS

See the SkyForce Facilitator HTML document — Operations, Finance, Strategy, Marketing, People, and External Shocks tabs — for complete scenario text, options, decision logic, game master notes, reflection questions, and game integration specs for all 18 board decisions.

## APPENDIX E — LIVE SIMULATION BRIEFS

See the SkyForce Facilitator HTML document — "Live Simulations" tab — for complete participant briefs (corporate side, union side, CMO elevator brief, etc.) for all 7 live simulations.

---

*Document prepared by ICAN for SkyForce platform development. All game mechanics, scenarios, city data, and world news content copyright ICAN — International Civil Aviation Network.*

*Version: 1.0 | SkyForce Platform PRD | For Claude Code Development Use*

---

## ADDENDUM — CLARIFICATIONS v1.1

### A1. City-to-City Distances
Calculated automatically using the Haversine great-circle formula from each city's latitude/longitude coordinates stored in the city_demand table. No pre-built distance table required. Formula:
```
distance_km = 2 × R × arcsin(√(sin²(Δlat/2) + cos(lat1)×cos(lat2)×sin²(Δlon/2)))
where R = 6,371 km
```
Applied at the point of route creation and cached in the routes table as `distance_km`. Recalculation only if route origin/destination changes.

### A2. Slider Dollar Costs — % of Quarterly Revenue
All operational spending sliders are expressed as a percentage of the team's quarterly revenue, calculated at quarter close:

| Level | % of Revenue |
|-------|-------------|
| None / Very Low | 0% |
| Low | 3% |
| Standard | 6% |
| High | 10% |
| Very High | 15% |
| Extreme | 20% |

Applied per category independently. Total slider spend can stack. Example: High Marketing (10%) + High Staff (10%) + Standard Food (6%) = 26% of revenue as combined slider spend.

### A3. Staff Cost Model
**Baseline staff cost (market rate) auto-calculated each quarter:**
```
baseline_staff_cost = 
  (fleet_size × $180,000/quarter per aircraft)        -- pilot + crew per plane
  + (active_routes × $45,000/quarter per route)       -- ground and ops staff per route
  + (hub_count × $800,000/quarter per hub)            -- hub management and operations
  + (base_fixed_cost: $2,000,000/quarter)             -- HQ and admin minimum
```

**Salary slider applies a multiplier to baseline:**
- Very Low: ×0.50 (50% below market — staff attrition risk, Ops −5/qtr, Loyalty −3%)
- Low: ×0.75 (25% below — Ops −2/qtr, Loyalty −1%)
- Standard: ×1.00 (market rate — baseline)
- High: ×1.10 (+10% above — Ops +3/qtr, Loyalty +2%)
- Very High: ×1.20 (+20% above — Ops +6/qtr, Loyalty +4%)
- Extreme: ×1.50 (+50% above — Ops +10/qtr, Loyalty +7%, Brand +5/qtr)

**Staff spend = baseline × slider multiplier.** This replaces the % of revenue model for the Staff category only (staff is volume-driven, not revenue-driven).

**Customer experience impact:** Staff slider directly affects in-flight service quality perception. Combined with food and gifts sliders, contributes to the service_score component of the attractiveness formula. If staff slider is Very Low while food slider is Extreme, there's a dissonance penalty (service score capped at 60 regardless of food/gifts spend).

### A4. Cargo Demand & Revenue Model
Business demand number = cargo capacity in tonnes/day. Example: a city with business demand 400 = 400 tonnes/day cargo capacity available on any route connecting to it.

**Cargo route demand:**
```
cargo_route_demand_tonnes_per_day = MIN(city_A.business, city_B.business)
-- Take the lower of the two cities (constraining city limits cargo capacity)
-- Amplifier does NOT apply to cargo (cargo is logistics-driven, not attraction-driven)
```

**Cargo revenue per route (quarterly):**
```
cargo_price_per_tonne = admin-set per route pair (base: $3.50/tonne for short-haul, $5.50 for long-haul)
cargo_revenue_per_day = cargo_tonnes_carried × cargo_price_per_tonne
quarterly_cargo_revenue = cargo_revenue_per_day × 91
```
Where `cargo_tonnes_carried = MIN(aircraft_cargo_capacity_tonnes, cargo_route_demand_tonnes_per_day × market_share_on_route)`.

**Cargo market share:** Same attractiveness model as passenger but using only: price (60%) + ops quality (40%). Brand score does not apply to cargo.

**Cargo storage costs (replaces slot fees for cargo):**
- Per active cargo destination: flat $200K–$800K/quarter (scales by destination tier)
- Tier 1 cargo hub (e.g., FRA, HKG, DXB): $800K/quarter
- Tier 2: $450K/quarter
- Tier 3: $250K/quarter
- Tier 4: $150K/quarter
No per-movement fee for cargo aircraft. Storage is a fixed quarterly commitment per destination.

### A5. Worst Outcome Per Scenario (Auto-Submit on Timeout)
Applied if team does not submit a decision within the allotted time:

| Scenario | Auto-Submit | Rationale |
|----------|-------------|-----------|
| S1 Ghost Fleet | Option C (continue flying) | Most negligent default — no action taken, 30% incident risk |
| S2 War in Corridor | Option B (continue, no reroute, no insurance) | Highest risk exposure, no mitigation |
| S3 Flash Deal | Option C (decline, no planes) | Miss opportunity; fleet falls behind |
| S4 Oil Gamble | Option C (open market, no hedge) | No strategy = maximum price volatility |
| S5 Gov Lifeline | Option C (private markets — delayed, costly) | Most expensive path, least benefit |
| S6 Rate Window | Option B (decline refinancing) | Miss the rate opportunity entirely |
| S7 Hungry Neighbour | Option C (let collapse, do nothing) | 60% chance routes permanently lost |
| S8 Political Favour | Option C (decline political request) | 40% permit disruption risk |
| S9 Blue Ocean | Option C (split budget, distracted airline) | Ops drag + no clear strategic win |
| **S10 World Cup Bet** | **$0 bid (not competing)** | Lowest possible bid; still pitches via L6 |
| **S11 Olympic Play** | **Option E (do nothing)** | ✅ This is legitimately a valid outcome — saves $18–65M in capital. Teams that don't submit are treated as having made a deliberate financial decision. No penalty beyond the relative brand gap vs. teams that did invest. |
| S12 Brand Grenade | Option A (terminate ambassador) | Impulsive, corporate reflex — causes the most post-twist damage |
| S13 Digital Gamble | Option D (cancel entirely) | Cedes all AI advantage to competitors |
| S14 Talent Heist | Option B (counter-offer capped at 20%) | Weak half-measure — likely to lose executive anyway |
| S15 Recession Gamble | Option A (mass redundancy) — or Option B if gov_board_card flag is set | Maximum short-term cost cutting, worst twist outcome |
| S16 Moscow Signal | Option A (aggressive) with maximum lock-in (4 quarters) | Highest commitment, worst exposure when false alarm triggers |
| S17 Green Ultimatum | Option D (legal challenge) | 70% chance of anti_environment flag + full levy + brand damage |
| S18 Cocoa Crisis | Option B (drop the chocolate) | Maximum loyalty damage for minimal saving |

**Note on S11:** If the platform detects a team did not submit S11, the dashboard displays: *"No decision submitted. Your airline has chosen not to invest in this cycle."* No negative flag applied. Capital is retained. This is the only scenario where timeout produces a financially competitive default.

### A6. Concurrent Session Handling
First submission wins and immediately locks the form for all other sessions. When the form is locked after submission, all other open sessions on the same team account see a toast notification: *"Decision submitted by your team. The form is now locked."* No merge, no conflict — strict first-submit-wins.

### A7. Seat Class Fares & Plane Configuration
**Fare setting per class:**
Each aircraft's available cabin classes are set at purchase or refurbishment. For each class present (First / Business / Economy), the team sets a fare using a slider within a pre-configured range:

- Admin pre-sets per route: `base_fare`, `min_fare`, `max_fare` per class
- These differ per city pair (LHR–DXB is a different range from GDL–MTY)
- Team moves slider within [min_fare, max_fare]; default = base_fare
- Fare is set per route per class; can be changed each quarter

**Cabin configuration at purchase:**
When ordering an aircraft, team selects configuration:
- Default (manufacturer standard: e.g., A330-200 = 17F/42C/194Y)
- Economy-only (all seats reconfigured to economy — higher capacity, lower yield)
- Business-heavy (remove economy rows, expand business — lower capacity, higher yield)
- Custom (slider to set F/C/Y split within technical limits of the aircraft type)
Configuration is locked once deployed. To change: must refurbish.

**Refurbishment:**
- Available for any owned aircraft (not leased)
- Cost: 5% of aircraft current book value
- Downtime: aircraft out of service for 1 quarter
- Can change cabin mix within technical limits
- Cannot add First Class to aircraft not designed for it (e.g., narrow-bodies are typically no First)

**Revenue by class:**
```
route_revenue = Σ(class_pax × class_fare) for each class on each flight
class_pax = daily_capacity_in_class × class_occupancy_rate
```
Business class passengers are more price-sensitive on brand and service (brand_score weight increases to 0.35, price_score decreases to 0.35 for business cabin attractiveness). Economy is more price-sensitive (price_score 0.55 weight).

### A8. Overdraft / Negative Cash (Revolving Credit Facility)
Real-world equivalent: **Revolving Credit Facility (RCF)** — an unsecured short-term credit line automatically drawn when cash goes negative.

**Rules:**
- Cash can go negative — the platform draws from an automatic RCF
- RCF interest rate = **double the current base rate** (e.g., base rate 3.5% → RCF rate 7.0%)
- Maximum RCF exposure: 15% of current Airline Value
- If negative cash exceeds this ceiling: platform blocks further non-essential spending (marketing, gifts, rewards sliders cap at Standard; new routes require admin approval)
- Cannot purchase aircraft (buy or lease), open secondary hubs, or make capital investments while in RCF
- Can still pay slot fees, staff, fuel, hub fees (operational obligations always paid)
- RCF balance shown on dashboard as a distinct liability line: "Revolving Credit Facility — $[X]M at [rate]%"
- RCF auto-repays when cash turns positive at quarter close (deducts from cash balance)

### A9. Project Aurora (L5)
Confirmed: entirely offline exercise. Platform involvement = zero. Admin enters impacts via the Live Simulation Outcome Entry panel. L5 is listed in the timeline (Q13–Q14) and admin can log outcomes (brand pts, cash, MVP cards, integrity/maverick flags) but the platform does not display any L5 content to players.

### A10. Leaderboard Visibility
Teams see: **rank position + Brand Value number only.** No financial details, no route counts, no fleet sizes of competitors visible to other teams. Admin can toggle whether Brand Value numbers are visible or only rank positions (e.g., admin may want to hide exact numbers during sensitive mid-game periods).

### A11. Route Fare Ranges — Admin-Configured
Before each simulation run, admin pre-loads a fare range table per route pair or per route distance band:

| Distance Band | Economy Min | Economy Base | Economy Max | Business Min | Business Base | Business Max |
|--------------|-------------|-------------|------------|-------------|--------------|-------------|
| Short (<2,000km) | $60 | $120 | $280 | $180 | $360 | $750 |
| Medium (2,000–5,000km) | $150 | $350 | $800 | $450 | $1,100 | $2,500 |
| Long (5,000–10,000km) | $300 | $650 | $1,500 | $900 | $2,200 | $5,000 |
| Ultra-long (>10,000km) | $500 | $950 | $2,200 | $1,500 | $3,500 | $8,000 |
| First Class | N/A | N/A | N/A | N/A | base × 3.5 | max × 3.5 |

Admin can override for specific city pairs (e.g., DXB–LHR has a different base than a generic long-haul route). Ranges stored in `route_fare_config` table keyed by origin/destination pair or distance band as fallback.

### A12. Quarter Timer
- Each quarter: 30-minute default duration
- Timer is visible to all players on the dashboard (countdown clock)
- Timer does NOT automatically advance to next quarter on expiry
- Admin controls: Start Timer, Pause Timer, Extend Timer (+5/+10/+15 min options), Reset Timer
- Timer serves as a pressure signal — quarter submission and decisions should be completed before it expires
- Admin manually clicks "Close Quarter" to trigger processing, regardless of timer state
- Timer state is broadcast via Supabase Realtime so all players see the same countdown

### A13. Second-Hand Aircraft Market
**Market participants:**
1. Airlines selling their own aircraft (decommission → lists on second-hand market)
2. Admin-injected aircraft (ICAN facilitators push planes into the market to adjust game economics)

**Pricing:**
- Seller (airline or admin) sets asking price — must be between current book value and 1.5× book value
- Buyer purchases at asking price immediately (no auction mechanic unless admin enables it)
- Book value transfers to buyer's fleet at the price paid (new depreciation schedule begins from purchase quarter)

**Lifespan mechanic:**
Each aircraft carries a manufacture year (based on when it was first ordered in the game). Lifespan = 20 years in real-world terms. Mapped to game quarters:
```
manufacture_game_year = base_year + ((order_quarter - 1) × 1.25)
  -- 1 game year = 5 real years; 1 quarter = 1.25 real years
retirement_real_year = manufacture_real_year + 20
retirement_quarter = calculated from retirement_real_year vs. game timeline
```

Example: A 747-400 ordered at Q1 (~year 2000) → retirement at year 2020 → retirement falls at approximately Q16. Admin and team are notified 2 quarters before mandatory retirement. Aircraft flagged as "aging" from 2 quarters before retirement.

At retirement quarter: aircraft automatically decommissioned. No operation possible. Book value = residual floor (10% of original purchase price). Can be listed on second-hand market at this residual value or scrapped (book value written to zero, small scrap proceeds).

**Second-hand aircraft carry:**
- Original manufacture date → determines remaining lifespan
- Current book value at sale
- Any eco-engine upgrade (transferred to buyer)
- Cabin configuration at time of sale

### A14. Multiple Admin Accounts — Permission Levels

| Role | Access |
|------|--------|
| Super Admin | Full control — all teams, all overrides, financial adjustments, scenario management, account management |
| Facilitator | Enter live sim outcomes, view all teams, open/close quarters, push notifications — cannot adjust financials or override scenario decisions |
| Observer | Read-only — view all dashboards and admin panels, no write access |

### A15. Taxes
Applied at quarter close as part of cost calculations:

| Tax | Rate | Applied To |
|-----|------|-----------|
| Corporate Income Tax | 20% of net profit (if positive) | Net profit before tax |
| Passenger Departure Tax | $12/departing passenger (economy), $22 (business), $45 (first) | Per route, per departure |
| Fuel Excise Tax | 8% of total fuel cost | Applied on top of fuel calculation |
| Airport/Government Fees | Included in slot fee structure | Already in slot fee per movement |
| Carbon Levy (from Q17) | $45/tonne CO2 (approx 0.12kg CO2 per litre fuel burned) | Applied after S17 decision |

Corporate tax only applies on profitable quarters. Loss quarters carry forward to offset future tax (tax loss carry-forward tracked per team). Tax shown as a separate P&L line: "Tax Expense / (Tax Credit)".


---

## ADDENDUM v1.2 — CONFIRMED MECHANICS

### B1. Slider Restructure — 5 Sliders (Final)

Old structure had In-Flight Food + In-Flight Gifts as separate sliders. These are now merged into **In-Flight Service**. A new **Operations** slider replaces them. Total remains 5 sliders:

| # | Slider | Covers | Cost Basis |
|---|--------|--------|-----------|
| 1 | Staff & Training | Cabin crew, pilots, check-in, customer-facing ground staff, training programmes | Separate formula (see A3) |
| 2 | Marketing | Brand campaigns, advertising, partnerships, social, PR | % of revenue |
| 3 | In-Flight Service | Food, beverages, amenity kits, gifts, entertainment, cabin cleanliness | % of revenue |
| 4 | Rewards Program | Loyalty programme, tier benefits, partner redemptions | % of revenue |
| 5 | Operations | Maintenance, fleet engineering, ground equipment, cargo staff, technical operations | % of revenue |

**In-Flight Service impacts (per quarter):**

| Level | % Revenue | Brand Pts | Loyalty | Pax Rev Premium | Notes |
|-------|-----------|-----------|---------|-----------------|-------|
| Very Low | 0% | −4/qtr | −5% | −8% | No service. Complaints guaranteed. |
| Low | 3% | −2/qtr | −2% | −3% | Minimal offering. Below expectations. |
| Standard | 6% | 0 | 0 | 0 | Market average. No differentiation. |
| High | 10% | +3/qtr | +4% | +4% | Noticeable quality. Repeat business. |
| Very High | 15% | +6/qtr | +7% | +8% | Premium feel. Loyalty driver. |
| Extreme | 20% | +10/qtr | +12% | +14% | Signature service. Brand defining. |

**Operations slider impacts (per quarter):**

| Level | % Revenue | Ops Pts | Maintenance Index | Cargo Sat | Brand Hit | Notes |
|-------|-----------|---------|-------------------|-----------|-----------|-------|
| Very Low | 0% | −5/qtr | −2.0/qtr | −25% | −3 Brand Pts/qtr | Neglect. Aircraft lifespan erodes fastest. Safety signal. |
| Low | 3% | −2/qtr | −0.5/qtr | −10% | −1 Brand Pts/qtr | Mild neglect. Visible to ops teams. |
| Standard | 6% | 0 | +1.0/qtr (neutral) | 0 | 0 | Baseline. Aircraft on normal depreciation track. |
| High | 10% | +3/qtr | +1.5/qtr | +10% | 0 | Above average. Slight lifespan extension possible. |
| Very High | 15% | +6/qtr | +2.0/qtr (catch-up) | +15% | 0 | Premium maintenance. Catches up 1.0/qtr deficit. |
| Extreme | 20% | +10/qtr | +2.5/qtr (catch-up) | +25% | 0 | Best-in-class. Catches up 1.5/qtr deficit. |

**Cargo customer satisfaction** flows directly from Operations slider. Satisfaction determines cargo market share attractiveness: `cargo_attractiveness = (cargo_price × 0.60) + (ops_satisfaction × 0.40)` where ops_satisfaction = Operations slider level / 6 × 100.

### B2. Maintenance Formula — Aircraft Lifespan (Robust)

**Base lifespan:** 80 quarters (20 years × 4 quarters/year)

**Manufacture real-year tracking:**
```
aircraft.manufacture_real_year = 2000 + ((order_quarter - 1) × 1.25)
  -- each game quarter = 1.25 real-world years
aircraft.base_retirement_real_year = manufacture_real_year + 20
aircraft.base_retirement_quarter = derived from base_retirement_real_year
```

**Maintenance deficit accumulation (per quarter, per aircraft):**
```
maintenance_contribution = {
  Operations Very Low:  -2.0,   -- quarter of neglect: -2 from effective lifespan
  Operations Low:       -0.5,   -- mild neglect
  Operations Standard:  +1.0,   -- holding steady (positive = not degrading)
  Operations High:      +1.5,   -- slight benefit
  Operations Very High: +2.0,   -- includes catch-up; reduces deficit by 1.0/qtr
  Operations Extreme:   +2.5    -- accelerated catch-up; reduces deficit by 1.5/qtr
}

per aircraft, per quarter:
  if contribution < 0:
    aircraft.maintenance_deficit += abs(contribution)
  else if aircraft.maintenance_deficit > 0:
    catch_up = max(0, contribution - 1.0)   -- 1.0 = neutral baseline; above = catch-up
    aircraft.maintenance_deficit = max(0, aircraft.maintenance_deficit - catch_up)

effective_lifespan_quarters = 80 - aircraft.maintenance_deficit
actual_retirement_quarter = order_quarter + effective_lifespan_quarters
```

**Effective retirement** = whichever comes first: `actual_retirement_quarter` OR `base_retirement_quarter`

**Example:** Team orders A330-200 at Q1. Runs Operations at Very Low for Q3–Q6 (4 quarters × −2.0 = −8.0 deficit). Effective lifespan = 80 − 8 = 72 quarters. Aircraft retires at Q1 + 72 = Q73 (outside 20-quarter game) — but wait, base retirement is Q1 + 62 quarters (year 2020 = Q16 approx). So base_retirement still wins in this scenario. However if they neglect maintenance from Q1 through Q12 (12 quarters × −2.0 = −24 deficit): effective lifespan = 80 − 24 = 56 quarters. Retirement = Q1 + 56 = Q57 — but base is still Q~16. Base wins again. Where it matters: aircraft ordered in Q10 (manufactured ~2012) base retirement = 2032 = game doesn't reach it. But with extreme neglect: lifespan could drop to say 30 quarters → retires Q40 → still outside game. So neglect matters most for aircraft ordered early AND for Brand Value hits.

**Key insight:** In a 20-quarter game, the lifespan mechanic primarily affects: (1) Brand Value and Ops Points through the maintenance_deficit as an ongoing signal of fleet quality, (2) real aircraft that were manufactured pre-2000 if the admin introduces them on the secondary market.

**Brand Value impact of maintenance neglect (beyond Ops Pts):**
- Each quarter with negative maintenance_contribution: additional −(abs(contribution) × 1.5) Brand Pts
  - Very Low: −3 Brand Pts/qtr (on top of regular Ops Pts impact)
  - Low: −0.75 Brand Pts/qtr (round to −1)
- Aircraft in "Aging" status (within 4 quarters of effective retirement): −2 Brand Pts/qtr per aging aircraft
- Aircraft decommissioned due to maintenance failure (deficit > 30): −15 Brand Pts one-time hit + "Safety Flag" on record

### B3. Secondary Market (Auction Mechanic)

**Listing a plane for sale:**
1. In Fleet Management, team clicks "List on Secondary Market" on any owned aircraft (not leased)
2. Sets asking price: minimum = current book value; maximum = book value × 1.5
3. Listing appears immediately on the Secondary Market tab for all teams
4. Listing shows: Airline name, aircraft type, seats, manufacture year, book value, remaining lifespan (quarters), eco-upgrade status, cabin config, asking price

**Bidding:**
- Any team (including the listing team's rivals) can submit a bid from the Secondary Market tab
- One active bid per listing at a time — if a bid is pending, new bids are queued (visible as "X bids waiting")
- Seller receives in-platform notification: "Team [X] has bid $[Y] on your [Aircraft Type]"
- Seller has until end of current quarter to Accept or Reject
- **Accept:** Buyer's cash deducted immediately. Plane transfers to buyer's fleet at the start of next quarter (1-quarter handover). Plane is removed from seller's active fleet but remains on their balance sheet at book value until transfer quarter
- **Reject:** Listing stays open. Next queued bid becomes active. Seller can also de-list at any time
- **No response by quarter close:** Bid auto-expires. Next queued bid activates

**Visibility:** Both buyer and seller identities are fully visible to all teams on the Secondary Market tab. "For Sale: Airline B — 777-200ER | Asking $65M | Bid by Airline D: $60M (pending)." This is market intelligence — it signals when teams are downsizing, upgrading, or desperate for cash.

**Admin-injected aircraft:**
- Admin lists aircraft in Secondary Market via admin portal
- Admin sets fixed price (no minimum floor required — admin can subsidise at below book value)
- Admin-injected listings show as "Available — Market" (no airline name shown)
- Admin can set an auction-style listing (opens bidding) or a buy-it-now listing (no bidding, any team clicks "Purchase" and it's theirs)

**Transfer mechanics:**
- 1-quarter delivery delay (same as new aircraft orders)
- Cabin config transfers as-is. Buyer can reconfigure post-transfer (costs 10% of book value)
- Eco-upgrade transfers with aircraft. No additional cost.
- Depreciation schedule continues from aircraft's original purchase date. Buyer inherits the existing depreciation curve, not a fresh one.

### B4. Aircraft Configuration — Final Rules

| Situation | Config | Cost |
|-----------|--------|------|
| New aircraft purchase (buy) | Set at order time | Free |
| New aircraft lease | Set at lease time | Free |
| Refurbishment (owned only) | Any time post-delivery | 10% of current book value |
| Post-transfer (secondary market) | Any time after transfer quarter | 10% of current book value |
| Leased aircraft (mid-lease) | Not permitted | N/A |

Technical constraints on config:
- Narrow-body aircraft (A319, A320, A321, 737s, 757): cannot have First Class
- Regional jets: Economy only
- Wide-body (767, A330, 777, 747, A350, 787, A380): all three classes permitted
- Minimum cabin ratio: at least 60% Economy on any passenger aircraft (prevents all-first-class configurations that break demand calculations)

### B5. Tax Loss Carry-Forward — 5 Quarters
Confirmed: 5-quarter maximum carry-forward. Loss incurred in Q8 can offset profits in Q9, Q10, Q11, Q12, Q13. Unused balance from Q8 expires at Q14 close regardless of whether it was used.

Displayed on dashboard P&L: "Tax Loss Carry-Forward: $[X]M (expires Q[n])"

### B6. Dissonance Penalty — Both Directions

Gap threshold: ≥ 3 slider levels difference between Staff and In-Flight Service.

| Situation | Effect |
|-----------|--------|
| Staff Very Low (1) + In-Flight Service Very High (5) or Extreme (6) | Dissonance: service_score capped at 55. "Great food, dreadful crew." Passengers notice the mismatch. |
| Staff Very Low (1) + In-Flight Service High (4) | Gap = 3 levels. Dissonance applies: service_score capped at 62. |
| In-Flight Service Very Low (1) + Staff Very High (5) or Extreme (6) | Dissonance: service_score capped at 65. "Wonderful crew, nothing to offer." Staff partially compensate. |
| In-Flight Service Very Low (1) + Staff High (4) | Gap = 3 levels. service_score capped at 68. |
| Any gap < 3 levels | No dissonance penalty. |

Dissonance flag shown to teams on the dashboard ops panel as a visible warning: "⚠ Service dissonance detected — review Staff and In-Flight Service alignment."

### B7. Cargo Fare Slider — Single Rate Per Route
Cargo aircraft use a single cargo rate slider per route (no cabin classes). Admin pre-sets:
- `cargo_min_rate` ($/tonne)
- `cargo_base_rate` ($/tonne)
- `cargo_max_rate` ($/tonne)

Per distance band (default pre-sets, admin-adjustable):
| Distance | Min $/T | Base $/T | Max $/T |
|----------|---------|---------|---------|
| Short (<2,000km) | $1.80 | $3.00 | $5.50 |
| Medium (2,000–5,000km) | $2.50 | $4.20 | $7.80 |
| Long (5,000–10,000km) | $3.50 | $5.80 | $10.50 |
| Ultra-long (>10,000km) | $4.50 | $7.20 | $13.00 |

Team sets slider within [min, max] per cargo route. Default = base. Can adjust each quarter.

NOTE: Cargo fare picture references from client pending — ranges above to be validated against shared images when received. Admin can adjust all values in admin portal before simulation starts.

### B8. Emergency Credit Line (formerly RCF)
In-game name: **Emergency Credit Line (ECL)**. Displayed to players as exactly that — no financial jargon.

- Activates automatically when cash balance goes negative
- Rate = double the current base rate at time of activation (recalculated if base rate changes)
- Ceiling = 20% of current Airline Value
- If balance exceeds ceiling: capital actions blocked; ops sliders cap at Standard; admin notified
- If ceiling breached for 2 consecutive quarters without recovery: admin receives alert to trigger "Distressed Airline" flag
- Dashboard shows: red ECL banner, current balance, interest accruing per quarter, ceiling remaining


---

## ADDENDUM v1.3 — IMAGE ANALYSIS & FINAL MECHANICS

### C1. Cargo Fare System — Multiplier Model (from Reference Images)
The cargo fare is NOT set as an absolute $/ton number. Teams set a **multiplier on a base rate**, consistent with how the reference game works. Admin sets the base fare per route (or per distance band), teams slide between 0.30× and 1.70× that base.

**Multiplier system:**
```
cargo_fare_per_ton = base_fare × team_multiplier
team_multiplier: range 0.30 to 1.70, step 0.01, default 1.00
displayed to team as: "$[X]/ton ([multiplier])"
-- e.g. "$ 2,258/ton (1.00)" at midpoint
-- e.g. "$ 3,838/ton (1.70)" at maximum
-- e.g. "$ 677/ton (0.30)" at minimum
```

**Admin-set base fares per distance band (pre-loaded, admin-adjustable):**
| Distance Band | Base $/ton | Min (0.30×) | Max (1.70×) |
|--------------|-----------|------------|------------|
| Short (<2,000km) | $800 | $240 | $1,360 |
| Medium (2,000–5,000km) | $2,200 | $660 | $3,740 |
| Long (5,000–10,000km) | $4,000 | $1,200 | $6,800 |
| Ultra-long (>10,000km) | $6,000 | $1,800 | $10,200 |

Calibration note: Madrid–Moscow (reference game, 3,447km medium-long) shows 677–3,838 range, base ~2,258. Our medium-band (2,000–5,000km) produces similar numbers. Confirmed alignment.

**Competitor visibility on cargo routes (matching reference game Image 11):**
On any cargo route, teams can see all competitors with: Airline name, Plane type, Schedules/week, Fare multiplier, Satisfaction %, Occupancy %, Cargo tonnage, Profit (this quarter). This is visible from the Route Management view, "Competitors" tab. Same mechanic applies to passenger routes: Airline name, Plane, Schedules, Fare (each class multiplier), Satisfaction, Occupancy per class, Passengers, Revenue.

### C2. P&L Structure — Aligned to Reference Game (Image 5)
Final P&L line items per quarter:

**Income:**
- Passenger Revenue (by cabin class breakdown available on drill-down)
- Cargo Revenue

**Expenses:**
- Personnel Expense (staff cost — see C3)
- Fuel Expense
- Slot Expense (landing fees × movements)
- Hub Terminal Fee
- Maintenance Expense (driven by Operations slider + fleet age)
- Investment Expense (Marketing + In-Flight Service + Rewards sliders combined)
- Office Expense (fixed quarterly admin cost per hub + route admin overhead)
- Facility Expense (cargo storage quarterly fees)
- Aircraft Lease Expense (operating lease payments)
- Emergency Credit Line Interest (if ECL active)
- Depreciation

**Below the line:**
- Aircraft Sales Income (proceeds from secondary market sales)
- Aircraft Purchase (capital expenditure)
- Tax Expense / Tax Credit
- Net Profit / Loss

### C3. Staff Model — Category Breakdown (from Image 2)
Staff is tracked across four categories with auto-calculated headcounts. Teams control two sliders: **Employee Rate** (how many staff) and **Employee Salary** (how much they earn). Replaces the single "Staff & Training" slider.

**Headcount formulas (auto-calculated):**
```
cabin_crew        = SUM(aircraft.seats_per_route × route.weekly_flights × 0.35)
                    -- 35% of seat capacity as minimum crew ratio
ground_staff      = (active_airports × 180) + (active_routes × 12)
technical_staff   = fleet_size × 85
                    -- mechanics, engineers, operations per aircraft
office_staff      = 50 + (active_routes × 8) + (hubs × 120)
                    -- admin, planning, management
```

**Employee Rate slider** (how many staff vs. minimum required):
- Very Low: 0.70× headcount (skeletal crew — delays, complaints, ops failures)
- Low: 0.85× headcount
- Standard: 1.00× headcount (industry minimum)
- High: 1.15× headcount (comfortable coverage)
- Very High: 1.30× headcount (premium staffing)
- Extreme: 1.50× headcount (exceptional coverage)

**Employee Salary slider** (pay vs. market rate):
- Very Low: 0.50× market salary → staff attrition, Ops −5/qtr, Loyalty −3%
- Low: 0.75× market salary → mild attrition
- Standard: 1.00× market salary → baseline
- High: 1.10× → Ops +3/qtr, Loyalty +2%
- Very High: 1.20× → Ops +6/qtr, Loyalty +4%
- Extreme: 1.50× → Ops +10/qtr, Loyalty +7%, Brand +5/qtr

**Quarterly staff cost:**
```
market_salary_per_person = {cabin_crew: $2,800/mo, ground: $1,400/mo, technical: $2,200/mo, office: $1,600/mo}
quarterly_staff_cost = SUM(category_headcount × market_salary × salary_multiplier) × 3 months
employee_rate_multiplier applies to headcount (and thus total cost linearly)
```

**Staff satisfaction status** (displayed on dashboard as badge):
Derived from salary slider + employee rate slider:
- Both ≥ High: "Highly Satisfied" → +Brand Pts bonus
- Both ≥ Standard: "Satisfied"
- Either ≤ Low: "Concerned"
- Either at Very Low: "Unhappy" → strike risk flag raised

Maintenance of the dissonance penalty: Gap ≥ 3 levels between Salary slider and Rate slider → "Understaffed / Overpaid" or "Overworked / Underpaid" warning.

### C4. Maintenance Ownership — 80% Operations / 20% Staff
Final formula for maintenance_index per aircraft per quarter:
```
ops_contribution = Operations_slider_contribution × 0.80
staff_contribution = Salary_slider_level / 6 × 0.20
                     -- normalized 0–1 and scaled to 20% weight

effective_maintenance_index = ops_contribution + staff_contribution

Salary Very Low:   staff_contribution = −0.5 × 0.20 = −0.10
Salary Standard:   staff_contribution = 0 × 0.20 = 0
Salary Extreme:    staff_contribution = +0.5 × 0.20 = +0.10
```

**Brand Value hit from maintenance neglect (confirmed):**
- Operations Very Low: −3 Brand Pts/quarter additional (beyond Ops Pts impact)
- Operations Low: −1 Brand Pts/quarter additional
- Aircraft with `maintenance_deficit > 20`: "Fleet Integrity Warning" appears on dashboard — −2 Brand Pts/quarter per aircraft in this state
- Aircraft decommissioned due to deficit > 30: −15 Brand Pts one-time + "Safety Concern" reputation flag

### C5. Cargo Satisfaction — Age Factor Added
Updated cargo attractiveness formula:
```
plane_age_months = (current_quarter - order_quarter) × 15
                   -- 1 game quarter = ~15 months at our timeline scale
plane_age_factor = MAX(0.70, 1.0 - (plane_age_months / 240) × 0.30)
                   -- planes start at full factor (1.0), degrade to 0.70 at 20 years (240 months)
                   -- each year older reduces factor by 1.5%

cargo_attractiveness = (price_score × 0.55) + (ops_satisfaction_score × 0.35) + (plane_age_factor × 0.10)
where:
  ops_satisfaction_score = Operations_slider_level / 6
  price_score = (avg_competitor_fare / team_fare) × 100, capped 30–170
```

The 10% age factor means a new aircraft has a small competitive advantage in cargo markets over an older one running the same route at the same price. This incentivises fleet renewal without making age the dominant factor.

### C6. Secondary Market — All Bids Visible Simultaneously
Updated mechanic: All bids are visible to the seller at once. Seller accepts or rejects each. Accepting one auto-rejects all others with immediate notification to rejected bidders.

**Bid display on Secondary Market listing:**
```
[Airline B — A330-200ER] | Year 2003 | Lifespan: 68 mo remaining | Book Value: $48M | Asking: $55M
Cabin: 17F / 42C / 194Y | Eco-Engine: Yes | Maintenance Status: Good

Active Bids:
  Airline C: $52M [Accept] [Reject]
  Airline D: $54M [Accept] [Reject]
  Airline A: $50M [Accept] [Reject]
```
Bids sorted by value descending. Seller sees all at once. Can accept any at any time. If seller accepts Airline D's $54M: Airline C and A receive: "Your bid on [Aircraft] was not accepted. The aircraft has been sold."

### C7. Refurbishment Cost — Final Rule
- **Cost:** 20% of current book value, with a minimum floor of 5% of original purchase price
- **Effect:** Grants +2 years (8 quarters) of additional lifespan to the aircraft
- **Downtime:** 1 quarter out of service
- **Applies to:** Owned aircraft only (not leased)
- **Leased aircraft:** Can set configuration free at time of lease order. Cannot change later.
- **Secondary market transfers:** New owner can refurbish at 20% of book value (inherited book value). Minimum floor applies to ORIGINAL purchase price, not inherited price. So a $120M 747 inherited at $30M book value: refurb = max(20% of $30M = $6M, 5% of $120M = $6M) = $6M. Fair and logical.

### C8. Per-Aircraft Lifespan Display (from Image 6 Reference)
Each aircraft in fleet management shows:
- **Lifespan remaining:** in months (converted from quarters: remaining_quarters × 15 months)
- **Individual satisfaction %:** derived from Operations slider quality × plane_age_factor × route_performance
- **Book value:** current depreciated value
- Displayed consistently in fleet detail view and secondary market listings

### C9. Cargo Storage — Airport Activation Required (from Image 14)
When a team opens a cargo route to a new airport for the first time, they must activate **Cargo Storage** at that airport. This is a one-time setup cost per airport:

| Airport Tier | Cargo Storage Setup Cost | Quarterly Storage Fee |
|-------------|------------------------|-----------------------|
| Tier 1 | $8M one-time | $800K/quarter |
| Tier 2 | $4M one-time | $450K/quarter |
| Tier 3 | $2M one-time | $250K/quarter |
| Tier 4 | $800K one-time | $150K/quarter |

Shown in New Route modal: "Cargo Storage: Active ✓" or "Cargo Storage: Not Set Up — one-time setup $[X]M required to operate cargo on this route."

Hub airport cargo storage is automatically set up and included in the hub terminal fee.

### C10. Aircraft Assignment — Per-Route Dedicated (from Image 3 Reference)
Matching the reference game mechanic: teams assign specific aircraft to specific routes. The route management view shows "Available by Slot" and "Available by Plane" — the number of additional flights that could be scheduled given slot availability and unused aircraft.

```
aircraft assignment: one or more specific aircraft assigned to one route
one aircraft can only serve one route per quarter
available_by_slot = MIN(origin_slots_remaining, destination_slots_remaining)
available_by_plane = unused_aircraft_of_suitable_type
schedules_per_week: set by team (1 to max_available)
quarterly_flights = schedules_per_week × 13 weeks
```

Unused aircraft (not assigned to any route) are tracked as inventory — "Unused" column in fleet view. Cost still applies (lease or depreciation), but no revenue generated.

### C11. Fleet Inventory View — Matching Reference Game (Images 7 & 8)
Fleet management has two views — toggle by Passenger / Cargo:

| Model | Type | Total | Used (routes) | Unused | On Order |
|-------|------|-------|--------------|--------|---------|

"Detail All" button drills into each aircraft's individual lifespan, satisfaction, route, book value.

### C12. Confirmed Open Items — Recommendations Adopted
- **Secondary market refurb cost**: 20% of book value, min 5% of original purchase price, +2 year lifespan ✓
- **All bids visible simultaneously**: seller accepts any, rest auto-rejected ✓
- **80/20 Ops/Staff maintenance split**: confirmed ✓
- **Cargo satisfaction age factor**: 10% weight, degrades from 1.0 to 0.70 over 20 years ✓
- **Tax loss carry-forward**: 5 quarters ✓
- **Dissonance both ways**: Staff vs In-Flight Service, ≥3 level gap triggers cap ✓


---

## ADDENDUM v1.4 — WIKI RESEARCH EXPANSION (DO NOT OVERWRITE PRIOR AGREEMENTS)

### D1. Flight Frequency Formula (Physics-Based)
Each aircraft assigned to a route has a maximum weekly schedule based on distance and speed:

```
flight_time_one_way_hrs = route_distance_km / aircraft_cruise_speed_kmh
turnaround_time_hrs = 2.0  -- ground handling time each end
round_trip_duration_hrs = (flight_time_one_way_hrs × 2) + (turnaround_time_hrs × 2)
max_daily_rotations = floor(24 / round_trip_duration_hrs)
max_weekly_schedules_per_aircraft = max_daily_rotations × 7
```

Multiple aircraft assigned to same route multiply total weekly schedules:
```
total_route_weekly_schedules = SUM(max_weekly_schedules for each aircraft on route)
total_daily_seat_capacity = (total_route_weekly_schedules × aircraft_seats) / 7
```

Cruise speeds by aircraft type (representative):
- Narrow-bodies (A319/320/321, 737 family): 840 km/h
- Wide-body medium (757, 767, A330): 870 km/h
- Wide-body large (777, 747, A380, 787, A350): 900 km/h

Example — A320 on DXB–LHR (5,500km):
- Flight time one-way: 5500/840 = 6.5 hrs
- Round trip: (6.5 × 2) + 4 = 17 hrs
- Max daily: floor(24/17) = 1 rotation/day
- Max weekly per plane: 7 schedules/week
- Add second A320: 14 schedules/week total

Example — A319 on DXB–MCT (350km):
- Flight time: 350/840 = 0.42 hrs
- Round trip: (0.42 × 2) + 4 = 4.84 hrs
- Max daily: floor(24/4.84) = 4 rotations/day
- Max weekly per plane: 28 schedules/week

### D2. Airport Route Capacity — Office Utilisation
Inspired by the reference game's counter/office mechanics, adapted for our simulation. We do not implement individual counter/office purchases. Instead:

**Route capacity threshold per airport:**
Each airport has a soft limit on how many active routes a team can operate through it before administrative strain reduces satisfaction:

```
route_capacity_per_airport = 5 + (hub_bonus × 10)
  -- non-hub airports: 5 routes before strain
  -- primary hub: 15 routes before strain (hub bonus = 1)
  -- secondary hub: 10 routes before strain (hub bonus = 0.5)

if active_routes_at_airport > route_capacity:
  overload_ratio = active_routes_at_airport / route_capacity
  satisfaction_penalty = (overload_ratio - 1.0) × 15  -- percentage point drop per excess ratio
  ops_pts_penalty = floor(overload_ratio - 1.0) × 2 per quarter
```

Shown on dashboard as: "Hub Operations: [X]% utilisation" with a colour indicator (green/amber/red). Teams can expand capacity by investing in a **Hub Operations Upgrade** (one-time cost: $5M per additional 5 routes of capacity).

### D3. Two-Tier Maintenance — Renovation vs. Refurbishment

**Renovation (new — lighter option):**
- Purpose: Restore falling satisfaction on an aircraft without changing lifespan or configuration
- Cost: 3% of current book value (minimum $500K)
- Downtime: None — aircraft remains in service
- Effect: Satisfaction restored to 80% of aircraft's "new" satisfaction rating
- Available from: Fleet Management detail view per aircraft
- When to use: When per-aircraft satisfaction drops below 50% due to age

**Refurbishment (previously agreed — heavier option):**
- Purpose: Extend lifespan + reconfigure cabin
- Cost: 20% of current book value, minimum 5% of original purchase price
- Downtime: 1 quarter out of service
- Effect: +2 years (8 quarters) added to effective lifespan + cabin reconfiguration
- Only for owned aircraft

Teams will see per-aircraft satisfaction on their fleet detail view. As satisfaction drops, the Renovate button appears with cost preview.

### D4. Hub Infrastructure Investments — One-Time Capital
Teams can invest in physical hub infrastructure at their primary or secondary hub airports. These are permanent investments, not sliders.

| Investment | One-Time Cost | Ongoing Cost | Effect |
|-----------|--------------|-------------|--------|
| Fuel Reserve Tank | $8M per hub | $200K/quarter maintenance | Fuel cost at this hub reduced by 15% |
| Maintenance Depot | $12M per hub | $400K/quarter staffing | Maintenance expense reduced by 20% for all aircraft operating from this hub |
| Premium Lounge | $5M per hub | $300K/quarter | First and Business class occupancy +8% on all routes through this hub |
| Hub Operations Expansion | $5M per +5 routes | $0 | Raises route capacity threshold by 5 |

Admin can grant or remove any infrastructure investment via admin portal.

### D5. Seasonal Demand Variation (Quarterly)
Quarters map to real-world seasons. Tourism demand is adjusted by a seasonal multiplier applied on top of growth rates and world events:

| Quarter in Game Year | Real-World Season | Tourism Multiplier | Business Multiplier |
|---------------------|------------------|-------------------|---------------------|
| Q1 of each game year | Jan–Mar (winter) | ×0.85 | ×1.05 |
| Q2 of each game year | Apr–Jun (spring/summer) | ×1.10 | ×1.00 |
| Q3 of each game year | Jul–Sep (peak summer) | ×1.20 | ×0.90 |
| Q4 of each game year | Oct–Dec (holiday) | ×1.05 | ×1.05 |

Note: Each "game year" = 4 consecutive quarters. Q1 of game year 1 = simulation Q1, Q2 of game year 1 = simulation Q2, etc. By simulation Q17, we're in game year 5, Q1 seasonality applies.

This means summer quarters see stronger tourism demand, and winter quarters see slightly stronger business demand. Crises, world events, and city growth rates still apply on top of these multipliers.

### D6. Aircraft Insurance
When an aircraft reaches end of effective lifespan (retirement) without being replaced, or is lost due to a scenario incident (e.g., S1 option C):

**Insurance payout = 75% of current book value** (slightly below the reference game's 80% to incentivise proactive fleet management).

Applies to:
- Mandatory retirement at end of lifespan: payout is automatic at quarter close
- Scenario-triggered loss (admin applies via scenario outcome): admin enters insurance payout
- Admin-forced decommission: payout is discretionary (admin sets %)

Insurance income appears as a line item: "Aircraft Insurance Proceeds" in the P&L.
Teams cannot opt out of insurance (it is assumed as standard operating cost within the Operations slider).

### D7. Competitor Intelligence — Route View (Both Passenger and Cargo)
Confirmed: Teams can see competitor data on any route they operate. Competitor view shows:

**Per competitor on the route:**
- Airline name
- Aircraft type assigned
- Weekly schedules
- Fare (multiplier for each class: e.g., "0.95 / 1.10 / —" for Economy/Business/First)
- Satisfaction %
- Occupancy % (per class for passenger; overall for cargo)
- Total passengers/cargo this quarter
- Route profit this quarter

This is publicly visible market intelligence. A team opening a new route can preview competitors before committing. Encourages strategic fare and scheduling decisions.

### D8. Confirmed: Point-to-Point Demand Only
No hub-and-spoke transfer mechanics. Route demand = only direct demand between the two cities. Transfer passengers who might go City A → Hub → City B are NOT counted in our simulation. This simplification keeps the game mechanics clean and appropriate for a 1.5-day simulation.


---

## ADDENDUM v1.5 — FINAL MECHANICS LOCK

### E1. Airport Infrastructure — Simplified (No Manual Slot/Counter/Office Management)
Slots, counters, and offices auto-scale with the number of active routes. Teams do not manage individual infrastructure units. A single **Customer Service Investment** slider within the Quarterly Operations form covers all airport operational quality for the team globally:

| Customer Service Level | % of Revenue | Effect |
|-----------------------|-------------|--------|
| Very Low | 0% | Check-in wait, ground delays. Satisfaction −8% on all routes. |
| Low | 2% | Below average. Satisfaction −3%. |
| Standard | 5% | Adequate. Baseline. |
| High | 8% | Smooth operations. Satisfaction +5%. |
| Very High | 12% | Premium ground experience. Satisfaction +10%, Loyalty +2%. |
| Extreme | 18% | Best-in-class. Satisfaction +15%, Loyalty +4%, Brand +3/qtr. |

Route capacity soft limit still applies (D2): beyond threshold routes for a given airport, satisfaction penalty compounds.

### E2. Fuel Storage System — Full Mechanic

**Concept:** Teams can invest in physical fuel storage capacity at their hub(s). Storage lets them pre-purchase fuel at a 25% bulk discount. In cash-tight situations, stored fuel can be sold back at market rate minus 25% (effectively break-even on stored cost, but valuable if they bought before a price spike).

**Storage capacity options (one-time capital + quarterly maintenance):**

| Tank Size | Storage Capacity | One-Time Cost | Quarterly Maintenance |
|-----------|-----------------|--------------|----------------------|
| Small | 25M litres | $3M | $150K/quarter |
| Medium | 75M litres | $8M | $350K/quarter |
| Large | 150M litres | $15M | $600K/quarter |

Teams can own multiple tanks (stacked capacity). Maximum total capacity: 300M litres.

**Fuel purchasing flow:**
```
market_fuel_price = (fuel_index / 100) × $0.18/L
bulk_purchase_price = market_fuel_price × 0.75  -- 25% discount

each quarter, teams choose:
  buy_into_storage: pay bulk_price × litres purchased (up to empty capacity)
  
quarterly fuel consumption:
  total_fuel_needed = SUM(distance × fuel_burn_L/km × weekly_flights × 13) for all routes
  fuel_from_storage = MIN(storage_current_level, total_fuel_needed)
  fuel_from_market = MAX(0, total_fuel_needed - fuel_from_storage)
  storage_level -= fuel_from_storage

quarterly fuel cost = (fuel_from_storage × purchase_price_paid) + (fuel_from_market × current_market_price)
```

**Selling stored fuel:**
```
sell_price = current_market_price × 0.75
sell_proceeds = litres_sold × sell_price
storage_level -= litres_sold
```

Strategic use: If a team buys fuel at index 100 ($0.135/L bulk) and the fuel spike (S4) hits next quarter (index 140, market $0.252/L), their stored fuel is worth $0.189/L to sell — they make $0.054/L profit vs what they paid. Or they simply use it, saving $0.117/L vs market.

This coexists with the S4 Oil Gamble (which is a contract lock-in at a fixed rate for passenger/route fuel costs). Teams can use both mechanics simultaneously.

### E3. Renovation — Combined Concept
All maintenance intervention is called **Renovation**. One concept, one name, one action per aircraft:

**Renovation:**
- Available for any owned aircraft (not leased)
- Cost: 20% of current book value (minimum 5% of original purchase price, grants +8 quarters lifespan)
- OR: 5% of current book value for **satisfaction-only restore** (no lifespan extension, no config change, no downtime) — called "Quick Service"
- Full renovation: 1 quarter downtime, satisfaction restored, lifespan +8 quarters, cabin config can be changed
- Quick Service: no downtime, satisfaction restored to 80% of new rating, no lifespan change

Both options visible in Fleet Management per aircraft with cost preview.

### E4. Maintenance Cost — Operations Slider Drives %

Maintenance cost per aircraft per quarter is a percentage of the aircraft's **original purchase price**, modulated by:
- Aircraft age (older = higher base maintenance %)
- Ops Points (higher Ops Pts = lower maintenance %)

```
base_maintenance_pct = {
  age 0–5 years (0–20 quarters): 0.8% per quarter
  age 5–10 years (20–40 quarters): 1.2% per quarter
  age 10–15 years (40–60 quarters): 1.8% per quarter
  age 15–20 years (60–80 quarters): 2.5% per quarter
}

ops_pts_discount = MIN(0.40, ops_pts / 250)
  -- max 40% discount at 100 Ops Pts
  -- 0% discount at 0 Ops Pts
  -- floor maintenance: 60% of base_maintenance_pct (cannot go below this)

effective_maintenance_pct = base_maintenance_pct × (1 - ops_pts_discount)
quarterly_maintenance_cost_per_aircraft = original_purchase_price × effective_maintenance_pct
```

High Ops Pts → lower maintenance bills → direct P&L benefit from the Operations slider.

### E5. Insurance — 3 Policy Levels

Teams select an insurance policy at game start and can change it **once per game year** (at Q1 of each new 4-quarter cycle).

| Policy Level | Quarterly Premium | Coverage on Loss |
|-------------|-----------------|-----------------|
| High (Level 3) | 0.5% of fleet market value per quarter | 80% of aircraft book value refunded |
| Medium (Level 2) | 0.3% of fleet market value per quarter | 50% of aircraft book value refunded |
| Low (Level 1) | 0.15% of fleet market value per quarter | 30% of aircraft book value refunded |

**Fleet market value** = SUM(original purchase price for all owned aircraft) — not depreciated book value, but the replacement cost. This means the premium scales with fleet size and composition.

Coverage triggers:
- Aircraft destroyed by scenario incident (S1 option C incident card, S2 airspace incident)
- Mandatory retirement at end of lifespan (if team did not sell or replace in advance)
- Admin-forced decommission (accident/safety ground — admin marks as insured loss)

Insurance proceeds = `coverage_pct × aircraft_book_value_at_time_of_loss`

Shown on dashboard as: "Insurance Policy: Level [X] · Premium this quarter: $[Y]M · Fleet coverage: $[Z]M"

### E6. Global Travel Index — All 20 Quarters

The Travel Index is the master demand multiplier. All city tourism and business demand numbers are multiplied by (travel_index / 100) each quarter. City-specific events and seasonality apply additionally. The index is pre-set and visible to all teams as a chart from Q1.

```
effective_city_demand = base_demand × (1 + annual_growth)^quarters × seasonal_mult × (travel_index/100) × city_event_modifier
```

| Quarter | Travel Index | Macro Narrative (aligned to World News) |
|---------|-------------|----------------------------------------|
| Q1 | 100 | Baseline. Market open. Global aviation on a growth path. |
| Q2 | 103 | World Cup announced. Business confidence high. New bilateral routes. |
| Q3 | 98 | Fuel spike dampens discretionary travel. Middle East tensions. |
| Q4 | 106 | Fuel stabilising. Tech conference boom. Argentina World Cup aftermath. European summer. |
| Q5 | 93 | Moscow Signal panic. -8% tourism on affected routes. Consumer uncertainty. |
| Q6 | 118 | False alarm lifted. Summer surge. Pent-up travel demand. |
| Q7 | 112 | Olympics host announced. War corridor unease offsets some growth. |
| Q8 | 89 | War escalates. Global anxiety. Business travel cautious. |
| Q9 | 104 | Recovery confirmed. Competitor struggling. Nairobi summit. New bilateral agreements. |
| Q10 | 128 | World Cup kicks off. Tournament effect. Peak global movement. |
| Q11 | 97 | Conflict escalates. Rate hike cycle begins. Consumer confidence dips. |
| Q12 | 91 | Rates at 5.5%. Recession risk rising. Business travel softening. |
| Q13 | 72 | Recession declared. Demand collapses -28% tourism, -25% business. |
| Q14 | 76 | Recession persists. Stimulus announced. Some recovery signs. |
| Q15 | 90 | Olympics drives demand spike. Stimulus filtering through. Recovery path established. |
| Q16 | 110 | Recession officially over. Rebound. Pent-up travel demand. Business meetings resume. |
| Q17 | 105 | Carbon levy uncertainty. Some caution. Formula 1 calendar boom. |
| Q18 | 122 | Full recovery. Dubai Expo 2040 announced. Brand Grenade noisy but demand strong. |
| Q19 | 126 | New trade corridors. Peru tourism surge. Caribbean weather issues offset by elsewhere. |
| Q20 | 130 | Final quarter. Peak global aviation era. Investor community watching. |

**How the index integrates with seasonal multipliers:**
The seasonal multiplier applies WITHIN each game year's Q structure on top of the Travel Index. Combined:
```
Q6 example: Travel Index 118 × Seasonal (Q2 of game year 2 = spring/summer = 1.10) = effective 129.8
  → Tourism demand at 130% of Q1 baseline for most cities
  → Consistent with "summer demand surges +35% vs dampened Q5 (93 × 1.35 ≈ 126 vs 118 × 1.10 ≈ 130)" ✓

Q13 example: Travel Index 72 × Seasonal (Q1 of game year 4 = winter = 0.85) = effective 61.2
  → Represents the devastating winter recession peak ✓
```

### E7. Hub Demand Multiplier — Recommended Formula

Being the "home carrier" at your hub gives a demand share advantage representing brand recognition, loyalty, and operational familiarity:

```
hub_attractiveness_bonus:
  routes where origin OR destination = team's PRIMARY hub: +18% to attractiveness
  routes where origin OR destination = team's SECONDARY hub: +10% to attractiveness
  (use higher bonus if both endpoints are within team's hub network — do not stack)

applied in attractiveness calculation:
  adjusted_attractiveness = base_attractiveness × (1 + hub_bonus)
```

This means on DXB–LHR, if your hub is DXB: a team with attractiveness score 80 gets 80 × 1.18 = 94.4, while rivals get 80. Your market share lift = 94.4 / (94.4 + 80 + ...) — meaningful but not insurmountable if competitors have better pricing or service.

**Hub selection therefore becomes a strategic asset** — a high-demand Tier 1 hub like DXB with 2.0× amplifier and your 18% home carrier bonus is extremely powerful. But expensive in terminal fees and slot competition. A smart team might pick a Tier 2 city with lower competition and similar effective advantage.

### E8. Additional Mechanics — New Ideas for Review

The following are proposed additions that build on reference game research and simulation logic gaps. Each needs a yes/no/modify from Hamade before inclusion in v1:

**E8.1 — Route Legacy Bonus**
Routes operated continuously for 4+ consecutive quarters gain "Established Route" status: +5% attractiveness bonus on that specific route (customer habit/brand stickiness). Resets if route is closed. Encourages long-term network planning over reactive closures.

**E8.2 — Fleet Uniformity Bonus**
If 80%+ of a team's fleet consists of the same aircraft family (e.g., Boeing 737 family), training costs are lower and operations simpler: Ops Points +3/quarter, maintenance cost −5% fleet-wide. Rewards strategic fleet coherence vs. a chaotic mix.

**E8.3 — Labour Relations Score (Historical)**
A separate 0–100 score that accumulates over the simulation based on: salary slider history, L1 strike outcome, S13 decision, S15 decision. High LR Score → lower strike probability in future scenarios, +3 Loyalty/quarter. Low LR Score → amplifies any future labour scenario consequences. Shown in CHRO dashboard view.

**E8.4 — Fare War Alert**
When two airlines on the same route both have fares below 0.70× base, a system alert fires: "Fare War on [route]". Both airlines' profitability on that route is penalised by an additional −10% (representing the brand damage of visibly desperate pricing). The only escape is one airline exits the route or raises fares.

**E8.5 — Route Suspension (vs. Permanent Closure)**
Teams can "suspend" a route instead of closing it: slots are retained but no flights operate. Costs 20% of normal quarterly slot fee (minimal holding cost). Useful during recession. Admin can lift suspension to reactive-open mid-quarter. Currently we only have permanent closure.

**E8.6 — Cargo Contract Opportunity (World News Linked)**
Certain world news items can include a cargo contract opportunity: "Dubai Expo 2040 — major equipment shipments required. First cargo airline to open DXB route earns: guaranteed 150 tonnes/week at $4,500/tonne for 4 quarters." Admin controls which teams are eligible and what the terms are. Converts cargo from open market to partially contracted revenue — more stable.

**E8.7 — Aircraft Efficiency Benchmark**
Dashboard widget showing team's fleet average fuel burn (L/km) vs. market average across all 5 teams: "Your fleet: 4.2 L/km · Market average: 3.8 L/km · Fuel overspend this quarter: $[X]M." Forces active fleet modernisation decisions. Purely informational but strategically motivating.

**E8.8 — First-Mover Bonus on New Routes**
When a team opens a route between two cities where no competitor currently operates: they earn a "First Mover" bonus of +12% attractiveness for 2 quarters (representing market establishment before competition arrives). Visible on route card as "First Mover Advantage — 1 quarter remaining." Rewards aggressive early expansion.

**E8.9 — Milestone Cards**
When teams reach operational milestones, they receive a brand card giving a small bonus:
- "First Cargo Route": +5 Ops Pts
- "10 Active Routes": +5 Brand Pts, +2% Loyalty
- "First Class Service Active": +3 Brand Pts
- "International Network" (routes on 3+ continents): +8 Brand Pts
- "Fleet of 10": +5 Ops Pts
Milestones are non-competitive (all teams can earn them) and celebratory in tone.

**E8.10 — Slot Competition at Tier 1 Airports**
Tier 1 airports (LHR, JFK, CDG, NRT, SIN, DXB, HKG, AMS, FRA) have limited total slots across all 5 teams. When total teams' flights at a Tier 1 airport exceed a threshold (e.g., 150 weekly flights across all teams), late-arriving teams pay a 25% slot fee premium ("peak slot surcharge"). First team to open routes claims standard pricing. Encourages early commitment to major airports.


---

## ADDENDUM v1.6 — FINAL ANSWERS LOCKED + MECHANICS COMPLETE

### F1. Customer Service — Replaces Slot/Counter/Office Management
Single slider, globally applied. Auto-scales with route count. No per-airport infrastructure management required by teams. See E1 for full table. The slider feeds into route satisfaction calculation alongside In-Flight Service and Staff sliders.

### F2. Flight Frequency — Physics-Based (Confirmed)
`max_weekly_schedules_per_aircraft = floor(24 / round_trip_duration_hrs) × 7`
Multiple aircraft assigned to same route stack linearly. System auto-calculates and shows teams: "Available schedules this week: [X]" when assigning aircraft to a route. Teams choose how many of the available schedules to actually operate (fewer schedules = lower cost but less capacity).

### F3. Renovation — Single Concept (Two Tiers Within It)
- **Quick Service**: 5% book value, no downtime, satisfaction restore only
- **Full Renovation**: 20% book value (min 5% original price), 1 quarter downtime, satisfaction restore + lifespan +8 quarters + optional cabin reconfiguration

Both live in Fleet Management per-aircraft detail. No "refurbishment" terminology.

### F4. Fuel Storage — Confirmed As Designed in E2
Teams decide storage capacity level and manage fuel as a real balance sheet item. Seasonal demand variation and S4 Oil Gamble both interact with this mechanic strategically.

### F5. Airport Ownership — Planned for V2
Full mechanic including: pricing control on landing fees charged to other teams, ownership economics, acquisition strategy, second airport in same city mechanics. Not in v1 scope.

### F6. Code-Sharing — Out of Scope
Not included. SkyForce is a competitive simulation. Cooperation mechanics would dilute the competitive tension.

### F7. Seasonal Demand — Confirmed + In HTML
Travel Index chart added to Game Timeline tab in facilitator HTML. Seasonality table added. Both are now part of the official game documentation.

### F8. Insurance — 3 Levels Confirmed (E5)
Teams select at game start. Can change once per game year at Q1 of each new 4-quarter cycle. Premium = quarterly cost. All three levels active from game start.

### F9. Hub Multiplier — Home Carrier Advantage (E7)
Primary hub: +18% attractiveness on all routes touching that airport.
Secondary hub: +10% attractiveness.
This gives hub selection a lasting strategic consequence throughout the simulation.

### F10. New Mechanics Proposals — E8 Series (Awaiting Approval)
10 proposals in E8 section. Each needs a yes/no/modify before inclusion in the engineering build. Reproduced below for decision:

| # | Mechanic | Recommended? | Notes |
|---|---------|-------------|-------|
| E8.1 | Route Legacy Bonus (+12% attractiveness after 4 consecutive quarters) | Yes | Rewards network stability |
| E8.2 | Fleet Uniformity Bonus (80%+ same family → Ops +3, maint -5%) | Yes | Rewards strategic fleet planning |
| E8.3 | Labour Relations Score (cumulative, affects future scenarios) | Yes | Adds CHRO role depth |
| E8.4 | Fare War Alert (both <0.70× → both penalised -10% route revenue) | Yes | Creates natural floor on destructive competition |
| E8.5 | Route Suspension (20% slot fee, no flights, slots held) | Yes | Essential for recession management |
| E8.6 | Cargo Contract Opportunity (world news linked guaranteed tonnage) | Yes | Differentiates cargo from passenger economics |
| E8.7 | Fleet Efficiency Benchmark (dashboard widget, fleet avg L/km vs market) | Yes | Informational pressure tool |
| E8.8 | First-Mover Bonus (+12% attractiveness × 2 quarters on new routes) | Yes | Rewards early expansion |
| E8.9 | Milestone Cards (operational achievements unlock small bonuses) | Yes | Celebratory, engagement-driving |
| E8.10 | Slot Competition at Tier 1 Airports (+25% fee when congested) | Yes | Creates urgency for early route commitment |

### F11. Missing Mechanics I'm Identifying for Your Review

Beyond the E8 proposals, these gaps exist in the current PRD and need decisions:

**F11.1 — Price Adjustment During Quarter**
Currently teams set fares at the start of a quarter and they're fixed. Should teams be able to adjust fares mid-quarter (between world news reveal and quarter close)? In the reference game this was turn-by-turn. For SkyForce it could be: one fare update per quarter after world news is revealed. Simple addition, big strategic value.

**F11.2 — Minimum Route Demand Threshold**
Should there be a minimum combined city demand to open a route? The reference game requires both cities' indices to exceed a minimum. Example: You cannot open a route between two Tier 4 cities with total demand < 50 passengers/day. This prevents teams from opening meaningless thin routes.

**F11.3 — Route Profitability Alert**
Should the platform flag routes that have been loss-making for 2+ consecutive quarters? A passive "Route Review Recommended" badge on the dashboard. Helps teams identify dead weight without admin intervention.

**F11.4 — Cargo Weight Capacity vs. Aircraft Payload**
Each cargo aircraft has a maximum payload in tonnes. Currently our cargo model matches supply to demand in tonnes. But if a team has a 747F (113T capacity) on a short thin route (40T demand), they're flying 73T empty. Should there be an explicit empty-weight penalty? Or is the occupancy model sufficient (low occupancy = low revenue, plane still costs fuel to fly)?

**F11.5 — Aircraft Orders — Minimum Lead Time**
Currently: order in Q2, arrives Q3. Should there be a minimum order lead time based on aircraft size? Example: narrow-bodies (1 quarter), wide-bodies (2 quarters), jumbo/super-jumbo (3 quarters). Adds realism and forces earlier planning for large aircraft.

**F11.6 — Fuel Hedging and Fuel Storage Interaction**
S4 Oil Gamble locks fuel cost at a specific rate. Fuel Storage lets teams buy cheap. If a team has both — does the hedge rate apply to fuel they draw from storage (meaning they benefit doubly), or does storage fuel always use the purchase-time price regardless of the hedge? Recommend: storage fuel uses purchase-time price always. Hedge applies only to the market fuel they buy in real-time. Two independent benefits, not stacking.

**F11.7 — Ground Stop / Force Majeure**
For scenarios like S16 Moscow Signal (airspace closure) or L7 Crisis Ops (no-fly zone), when a route is grounded mid-quarter: does the team get a refund on slot fees for those routes? Recommend: partial refund (50% of slot fees for grounded period), since the slots weren't used.

**F11.8 — Lease Return Market**
When a team returns a leased aircraft at end of term, where does it go? Currently it disappears. Better: returned leased aircraft automatically appear on the Secondary Market (admin-injected at book value). Keeps the secondary market active throughout the game.

**F11.9 — Alliance vs. Competition Intelligence Gap**
Teams can see competitor routes and fares (confirmed). But can they see competitors' financial health (cash balance, debt level, Brand Value breakdown)? Currently: leaderboard shows Brand Value number and rank only. Recommend: add one more public signal — "Fleet size" visible on leaderboard. Cash and debt remain private. This lets teams infer competitor capacity without full financial transparency.

**F11.10 — End-Game Scoring Multipliers**
The PRD mentions some cards have end-game multipliers (Premium Airline card +8% Airline Value, Green Leader ESG multiplier). These need to be fully enumerated before the engineering build. Partial list exists — needs a complete table of every end-game card and its exact multiplier effect at Q20 close.


---

## ADDENDUM v1.7 — ALL REMAINING MECHANICS LOCKED

### G1. Minimum Route Demand Threshold — Recommendation: Warning, Not Block
Do not block teams from opening thin routes. It is a strategic decision — some teams may deliberately open a low-demand route to a strategic city (e.g., to gain a hub foothold, to run cargo, to claim slots). Instead:

- No hard block on route opening based on demand
- When demand is very low relative to aircraft size (projected occupancy <25% at time of route setup), the route setup modal shows a **yellow warning**: "Low Demand Alert — Projected occupancy [X]%. This route may not be profitable at current demand levels."
- Teams proceed at their own discretion
- The route list view (see G2) will immediately flag it red if it underperforms

### G2. Route Dashboard — Colour-Coded Performance View
Route list shows all active routes in a table. Each route row is colour-coded by profitability this quarter:

| Row Colour | Condition | Displayed |
|-----------|-----------|-----------|
| Green | Net route profit >0 this quarter | Profit amount |
| Yellow | Net route profit 0 or marginal (within 10% of break-even) | Warning icon |
| Red | Net route loss for this quarter | Loss amount |
| Deep Red | Loss for 2+ consecutive quarters | Loss + "Route Review" badge |

**Per-route columns visible:**
- Route (Origin → Destination, distance)
- Aircraft assigned, weekly schedules
- Occupancy % (per cabin class for passenger; overall for cargo)
- Satisfaction %
- Quarterly Revenue
- Quarterly Cost (fuel + slot fees + storage)
- Net Profit / Loss
- Competitor count badge (e.g., "3 rivals")
- Action: Adjust Fare | Add Aircraft | Suspend | Close

### G3. Empty Cargo Payload — Occupancy Model Handles It
Correct. If a 747F (113T capacity) flies a route with 40T demand, occupancy = 40/113 = 35%. The aircraft still burns full fuel for the flight. Revenue = 40T × fare. No additional penalty beyond the naturally poor economics this produces. Teams learn quickly to match aircraft size to route demand — a core fleet management lesson.

### G4. Aircraft Delivery — 1 Quarter for All Types
All aircraft: order in Q(n), arrive in Q(n+1), operational from Q(n+1). No size-based delay tiers.

**Dreamliner (787-9) Exception — World News Event:**
When the 787-9 unlocks at Q8, teams can place orders. However, at Q9 World News, the following headline appears:

> **⚙ OPS · Boeing confirms 787 Dreamliner delivery delays — all orders pushed back 2 additional quarters due to manufacturing issues**
> *Teams with Q8 787-9 orders: aircraft arrives Q11 instead of Q9. Orders placed at Q9 onward: normal 1-quarter delivery.*

Admin applies the delay manually via fleet management (order_arrival_quarter updated from Q9 → Q11 for any Q8 orders). This is a real historical reference (787 program was famously delayed) and adds a decision moment: teams must plan around a gap in expected fleet expansion.

### G5. Fuel Hedge vs. Fuel Storage — Recommendation: Independent, No Stack
Recommended mechanic:

- **Fuel Storage** uses the price paid at time of bulk purchase (locked in). When storage fuel is consumed, the cost applied is that purchase price — regardless of current market rate. This is already baked into E2.
- **S4 Oil Gamble hedge** locks a specific rate for market purchases only. It does NOT retroactively change the price of fuel already sitting in storage.
- Teams can benefit from both simultaneously — storage gives a 25% bulk discount, and if they also hedged at a low rate, their market top-up is also cheaper. This is a realistic double-strategy (bulk purchase + futures contract).
- **No stacking restriction** — a team that bought $0.135/L bulk AND locked market at $0.162/L (10% hedge discount below spike price) is rewarded for smart financial planning. The hedge doesn't apply to storage — it only applies to whatever they need to top up from market.
- If a team has zero storage and fully hedged: they pay the hedge rate on all fuel. If they have full storage: they pay storage price on stored volume, market/hedge on any excess needed.

### G6. Ground Stop Slot Fee Refund — Recommendation
When admin or a scenario grounds a route mid-quarter (e.g., S16 Moscow route closure, L7 no-fly zone):

**Recommended rule:**
- If route is grounded for **half the quarter or more** (≥45 of 91 days): 50% slot fee refund for that route at quarter close
- If grounded for **less than half the quarter**: no refund (disruption absorbed as operational risk)
- Admin applies the refund via the team financial override panel
- Displayed in P&L as: "Slot Fee Refund — [Route] (Regulatory Closure): +$[X]M"
- The refund applies to landing fees only — hub terminal fees are not refunded (you're still using the hub)

### G7. Lease Returns — Secondary Market, No Buyback by Original Owner
When a leased aircraft's term expires and is not renewed:
- Aircraft automatically appears on the Secondary Market as an admin-injected listing
- Listed at the aircraft's current book value (inherited depreciation)
- **Original lessee cannot bid on their own returned aircraft** — system blocks this by team ID
- Other teams can bid normally
- If no team buys within 2 quarters: admin can adjust price or remove listing

### G8. Leaderboard — Fleet Size Added
Public leaderboard now shows: Rank | Airline Name | Brand Value | Fleet Size (total active aircraft)

All other metrics (cash, debt, routes, revenue) remain private.

### G9. End-Game Scoring Multipliers — Full Table

Applied at Q20 close, before final Brand Value is published. Each card/flag applies a modifier to the team's final Brand Value score:

| Card / Flag | Source | End-Game Effect |
|------------|--------|----------------|
| **Premium Airline** | S11 Option A (Official Olympic Carrier) | Airline Value × 1.08 (+8%) |
| **Global Brand** | S10 World Cup Winner | Brand Value +15 pts one-time |
| **Green Leader** | S17 Option C (SAF Investment) | Brand Health score × 1.10 (+10% brand component) |
| **Trusted Operator** | S1 Option A (Self-reported) | Ops Health score +8 pts |
| **Safety Leader** | S16 Option A (acted before declaration) | Ops Health score +5 pts |
| **People First** | S13 Option C (Reskill programme) | Brand Health +10 pts, Staff Commitment +20 |
| **Trusted Employer** | S15 Option C (Held headcount through recession) | Loyalty × 1.05 for final calculation |
| **Efficient Capital** | S6 refinancing taken | Financial Health +5 pts |
| **First Mover** | Opened a route before any rival | +3 pts Brand Value per qualifying route (max 15 pts total) |
| **Integrity Leader** | L5 Route D disclosed and refused | MVP +12 personal pts (not team Brand Value) |
| **anti_environment** | S17 Option D failed | Brand Health −15 pts permanent (already applied; no additional end-game hit) |
| **distracted_airline** | S9 Option C | Ops Health −5 pts |
| **greenwashing** | S18 Option D failed | Brand Health −6 pts (already applied) |
| **Safety Concern** | Aircraft decommissioned due to maintenance failure | Ops Health −10 pts one-time |
| **Established Routes** | E8.1 — 4+ quarter continuous operation per route | +2 pts Brand Value per qualifying route (max 10 pts) |
| **Fleet Uniformity** | E8.2 — 80%+ same family | Ops Health +5 pts end-game bonus |
| **Strong Labour Relations** | E8.3 — LR Score >75 at Q20 | Brand Health +8 pts |
| **No Insurance** (flew uninsured) | Never purchased insurance | Risk flag: if any incident occurred, penalty ×2 |
| **Cargo Diversification** | Ran cargo routes for 8+ quarters | Financial Health +4 pts (portfolio diversification signal) |

**Final Airline Value Calculation (Q20):**
```
raw_brand_value = (financial_health × 0.35) + (brand_health × 0.50) + (ops_health × 0.15)
  [all components calculated as previously specified]

after_card_modifiers = apply multiplier cards above

airline_value_final = raw_brand_value × (1 + sum of airline_value multipliers)
  e.g. Premium Airline card: × 1.08
       Green Leader: brand component × 1.10 (already in brand_health calc)

displayed_final_score = after_card_modifiers
  rounded to 1 decimal, shown on leaderboard
```

### G10. Airport Slot System — Full Mechanics

**Concept:** Slots at each airport accumulate quarterly and are auctioned each quarter. Airlines bid for slots — highest bidders win. This creates real competition for premium airport access as the game progresses.

**Starting slot inventory (per airport, per tier):**
| Tier | Starting Slots | End-Game Target (Q20) |
|------|---------------|----------------------|
| Tier 1 | 200 slots | ~1,000 slots |
| Tier 2 | 250 slots | ~750 slots |
| Tier 3 | 50 slots | ~300 slots |
| Tier 4 | 30 slots | ~120 slots |

**Slot release schedule — random once per game year:**
Each airport releases a batch of new slots once per game year (4 quarters), at a random quarter within that year (rolled by admin at game start, not known to teams in advance until the quarter before). Teams are notified 1 quarter ahead: "Next quarter: JFK releasing 45 new slots."

**Approximate release volumes per game year to hit end-game targets:**
| Tier | Annual Release (avg) | Note |
|------|---------------------|------|
| Tier 1 | 160 slots/year (40/quarter equivalent, but one burst) | Tier 1 airports: LHR, JFK, CDG, NRT, SIN, DXB, HKG, AMS, FRA |
| Tier 2 | 100 slots/year | |
| Tier 3 | 62 slots/year | |
| Tier 4 | 22 slots/year | |

Admin configures the exact release quarter per airport per game year before the simulation starts.

**Slot base prices (per slot, per auction):**
| Tier | Base Price Per Slot |
|------|-------------------|
| Tier 1 | $120K per slot (50% premium over Tier 2) |
| Tier 2 | $80K per slot |
| Tier 3 | $40K per slot (50% cheaper than Tier 2) |
| Tier 4 | $20K per slot |

**Auction mechanic:**
1. Quarter before release: teams see "Airport X releasing Y slots next quarter. Base price: $Z/slot."
2. Teams submit sealed bids during the quarterly ops submission: number of slots wanted + price per slot willing to pay (must be ≥ base price)
3. At quarter close: bids sorted by price per slot, descending. Slots allocated to highest bidders until exhausted.
4. **Tie-breaking:** if two teams bid the same price and slots run out, split equally (or admin decides)
5. Payment = bid_price × slots_won (deducted from cash at quarter close)
6. Unused released slots carry forward and accumulate: if 45 slots released and only 20 purchased, 25 carry to next release (stacks)

**Example:** JFK (Tier 1) has 200 existing slots. In Q4, 160 new slots release. Teams bid:
- Airline A: 60 slots @ $150K each
- Airline B: 80 slots @ $130K each
- Airline C: 30 slots @ $120K each (base price)
- Airline D: 50 slots @ $125K each

Sort descending: A(60@$150K) → B(80@$130K) → D(50@$125K) → C(30@$120K). Total 220 bids, 160 slots:
- A gets 60 slots: pays 60 × $150K = $9M
- B gets 80 slots: pays 80 × $130K = $10.4M
- D gets 20 slots (remaining): pays 20 × $125K = $2.5M
- C gets 0 slots

D is 30 slots short of what they bid for — they receive what was available.

**Slot usage:**
Each weekly flight on a route = 1 slot used at each endpoint airport. Teams need slots at BOTH airports for every flight. Slots are a quarterly asset — "using" them means deploying them in scheduled flights. Unused slots do not expire (teams hold them for future route expansion). Teams can return/sell slots (releasing them back to the airport pool — not to other teams directly; admin may re-list).

**Hub airport exception:** Each team's hub airport grants them a permanent 30 slots as part of the hub selection in Q1. These are included in the starting inventory above and allocated to the hub airline first.

### G11. E8 Mechanics — Final Decisions Applied

| # | Mechanic | Status | Notes |
|---|---------|--------|-------|
| E8.1 | Route Legacy Bonus | ✅ Approved | +12% attractiveness after 4+ consecutive quarters on same route |
| E8.2 | Fleet Uniformity Bonus | ✅ Approved | 80%+ same family → Ops +3/qtr, maintenance −5% |
| E8.3 | Labour Relations Score | ✅ Approved | CHRO dashboard view, affects future scenario consequences |
| E8.4 | Fare War Alert | ❌ Removed | Instead: route detail shows "Competitive Route" badge. No automatic penalty. |
| E8.5 | Route Suspension | ✅ Approved | 20% slot fee holding cost, no flights, slots retained |
| E8.6 | Cargo Contract Opportunities | ✅ Approved | World news linked guaranteed tonnage contracts, admin-controlled |
| E8.7 | Fleet Efficiency Benchmark | ✅ Approved | Dashboard widget: avg L/km vs market average |
| E8.8 | First-Mover Bonus | ✅ Modified | +20% attractiveness bonus (not 12%) for 2 quarters on route with no competitors. Reflected in occupancy — at 20% boost a solo operator gets even more of the demand |
| E8.9 | Milestone Cards | ✅ Approved | Non-competitive achievement badges with small bonuses |
| E8.10 | Slot Competition | ✅ Replaced | Full slot auction system (see G10 above — more comprehensive than E8.10 proposed) |

### G12. Fare Adjustment Window — Confirmed
Teams can adjust fares any time during an open quarter, as long as the next quarter has not yet started. Fare changes take effect immediately from the adjustment point. If a quarter close is processing, fare changes are locked. Multiple adjustments within one quarter are allowed — only the fare at quarter close is used for revenue calculations.

