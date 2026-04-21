// ============================================================
// SkyHigh Executive — Core Simulation Engine
// UI-agnostic game logic. No DOM access here.
// ============================================================
window.SkyHigh = window.SkyHigh || {};

window.SkyHigh.CoreSim = (() => {
  'use strict';

  // ── STATE ──────────────────────────────────────────────────
  let state = null;

  // ── PUBLIC API ─────────────────────────────────────────────
  const API = {

    // ── INIT ─────────────────────────────────────────────────
    init(profileData) {
      const doctrine = SkyHigh.DOCTRINES.find(d => d.id === profileData.doctrineId) || SkyHigh.DOCTRINES[0];
      state = {
        // Identity
        ceoName:      profileData.ceoName     || 'Alex Rivera',
        airlineName:  profileData.airlineName || 'SkyHigh Airlines',
        airlineCode:  profileData.airlineCode || 'SHX',
        hubAirportId: profileData.hubAirportId || 'JFK',
        liveryId:     'DEFAULT',
        doctrineId:   doctrine.id,

        // Progression
        round:        1,   // 1-20
        stage:        1,   // 1-4
        phase:        'COMMAND', // COMMAND | CRISIS | RESULT | REPORT

        // Financials
        cash:         SkyHigh.ECONOMY.startingCash,
        revenue:      0,
        expenses:     0,
        netThisRound: 0,
        totalRevenue: 0,

        // Competencies (0-100)
        boardConfidence: 65,
        safetyShield:    65,
        crewLoyalty:     65,
        servicePrestige: 60,

        // Fleet & Routes
        fleet: [
          { planeId: 'NARROWBODY', id: 'NB-001', name: 'Sierra Alpha', assignedRoute: null },
          { planeId: 'NARROWBODY', id: 'NB-002', name: 'Sierra Bravo', assignedRoute: null },
        ],
        routes: [],        // active routes
        pendingRoute: null,// route being created on map
        actionPoints: 3,   // actions available this command phase

        // Events
        crisisHistory: [],
        activeCrisis:  null,
        pendingCrisis: null,
        crisisCount:   0,
        currentBossPhase: 0,

        // Milestones
        unlockedMilestones: [],
        unlockedLiveries:   ['DEFAULT'],
        perks:              [],

        // Meta
        fuelPriceMultiplier: 1.0,
        demandMultiplier:    1.0,
        fareMult:            1.0,
        pendingEffects:      [],

        // ── NEW SYSTEMS ──────────────────────────────────
        credits:        10,    // premium currency (💎)
        deliveryQueue:  [],
        leasedFleet:    [],
        facilities:     {},
        logoId: 'EAGLE',
        tutorialStep: 0,
        roundHistory:  [],
        routeLog:      [],
        doctrineApplied: false,

        // ── FINANCING SYSTEM ─────────────────────────────
        loans: [],           // [{id, type, principal, outstanding, interestRate, termQtrs, remainingQtrs, quarterlyPayment, name}]
        creditRating: 'A',   // AAA | AA | A | BBB | BB | B | CCC | D
        missedPayments: 0,   // consecutive missed loan payments
        totalDebt: 0,        // sum of outstanding loan balances
        interestPaidTotal: 0,

        // ── CUSTOMER CARE (hidden competency) ────────────
        customerCare: 50,    // 0-100 hidden score, revealed after runway crises

        // ── BULK FUEL SYSTEM ──────────────────────────────
        fuelReserves: 0,     // litres in reserve tank (bought at locked price)
        fuelReservePrice: 0, // $/litre price fuel was purchased at
        fuelSpentThisQtr: 0, // litres consumed this quarter from reserves

        // ── DYNAMIC DEMAND / WORLD EVENTS ────────────────
        activeWorldEvents: [],    // [{eventId, roundsRemaining, demandMod, bizMod, cargoMod, fuelMod}]
        worldEventHistory: [],    // ids of fired events
        currentBankRate: 0.065,   // base interest rate this quarter
        passengerDemandSplit: {   // how total PAX demand is split (proportions, sum=1)
          business: 0.28,         // corporate travelers
          tourism:  0.58,         // leisure/tourism
          vfr:      0.14,         // visiting friends/relatives
        },
      };

      API._applyDoctrine(doctrine);
      API._applyHubBonus();
      return state;
    },

    // ── GETTERS ───────────────────────────────────────────────
    getState() { return state; },

    getStage() {
      if (state.round <= 5)  return 1;
      if (state.round <= 10) return 2;
      if (state.round <= 15) return 3;
      return 4;
    },

    // In-game date: round 1 = Jan 1985, each round = 1 quarter
    getGameDate() {
      const year  = 1985 + Math.floor((state.round - 1) / 4);
      const month = ((state.round - 1) % 4) * 3 + 1;
      return `${year}.${String(month).padStart(2, '0')}`;
    },

    // Star rating 1-5 based on average competency
    getStarRating() {
      const avg = (state.boardConfidence + state.servicePrestige + state.safetyShield + state.crewLoyalty) / 4;
      if (avg >= 88) return 5;
      if (avg >= 74) return 4;
      if (avg >= 58) return 3;
      if (avg >= 42) return 2;
      return 1;
    },

    // Full fleet = owned + leased (combined for display)
    getFullFleet() {
      return [...state.fleet, ...state.leasedFleet];
    },

    // ── COMMAND PHASE ACTIONS ─────────────────────────────────
    canTakeAction() {
      return state.phase === 'COMMAND' && state.actionPoints > 0;
    },

    openRoute(originId, destId, planeId, fareClass = 'economy', opts = {}) {
      if (!API.canTakeAction()) return { ok: false, reason: 'Not in command phase or no action points' };

      const origin = SkyHigh.GeoUtils.getAirport(originId);
      const dest   = SkyHigh.GeoUtils.getAirport(destId);
      if (!origin || !dest) return { ok: false, reason: 'Invalid airports' };
      if (originId === destId) return { ok: false, reason: 'Origin = destination' };

      const existing = state.routes.find(r => (r.originId === originId && r.destId === destId) || (r.originId === destId && r.destId === originId));
      if (existing) return { ok: false, reason: 'Route already exists' };

      const plane = SkyHigh.PLANES.find(p => p.id === planeId);
      if (!plane) return { ok: false, reason: 'Invalid plane class' };

      const distKm = SkyHigh.GeoUtils.distance(origin.lat, origin.lon, dest.lat, dest.lon);
      if (distKm > plane.rangeKm) return { ok: false, reason: `${plane.shortName} can't reach ${dest.city} (${Math.round(distKm)}km > ${plane.rangeKm}km range)` };

      const band = SkyHigh.GeoUtils.getDistanceBand(distKm);
      const routeCost = API._calcRouteOpenCost(plane, distKm);

      if (state.cash < routeCost) return { ok: false, reason: `Insufficient funds. Need $${(routeCost/1e6).toFixed(1)}M` };

      // Calculate flight time
      const flightTimeH = Math.round((distKm / plane.cruiseKmh) * 10) / 10;

      const routeId = `${originId}-${destId}-${state.round}`;
      state.routes.push({
        id: routeId,
        originId, destId,
        planeId, fareClass,
        distKm: Math.round(distKm),
        distBand: band,
        flightTimeH,
        openedRound: state.round,
        status: 'ACTIVE',
        // New route parameters
        routeType:      opts.routeType      || 'PAX',  // PAX | CARGO
        flightsPerWeek: opts.flightsPerWeek || 7,
        fareMultiplier: opts.fareMultiplier || 1.0,
        bizClass:       opts.bizClass       || false,
        lastRevenue: 0,
        lastProfit: 0,
        profitHistory: [],
      });

      state.cash -= routeCost;
      state.actionPoints--;
      API._checkMilestones();

      return { ok: true, routeId, costSpent: routeCost, distKm: Math.round(distKm), band, flightTimeH };
    },

    // ── LEASE A PLANE ──────────────────────────────────────────
    leasePlane(planeId) {
      if (!API.canTakeAction()) return { ok: false, reason: 'Not in command phase' };
      const plane = SkyHigh.PLANES.find(p => p.id === planeId);
      if (!plane) return { ok: false, reason: 'Invalid plane' };
      if (plane.unlockRound > state.round) return { ok: false, reason: `Unlocks at round ${plane.unlockRound}` };

      // Lease requires 1 quarter upfront deposit
      const deposit = plane.leaseMonthlyCostM * 3 * 1_000_000;
      if (state.cash < deposit) return { ok: false, reason: `Insufficient funds. Need $${(deposit/1e6).toFixed(1)}M deposit` };

      const id = `L-${planeId.substring(0,2)}-${String(state.leasedFleet.length + 1).padStart(3,'0')}`;
      const names = ['Lima','Mike','November','Oscar','Papa','Quebec','Romeo','Sierra'];
      const name  = `Charter ${names[state.leasedFleet.length % names.length]}`;
      state.leasedFleet.push({ planeId, id, name, assignedRoute: null, leaseMonthlyCostM: plane.leaseMonthlyCostM, startRound: state.round, leased: true });
      state.cash -= deposit;
      state.actionPoints--;
      return { ok: true, planeId: id, deposit };
    },

    // ── BUY USED PLANE ─────────────────────────────────────────
    buyUsedPlane(planeId) {
      if (!API.canTakeAction()) return { ok: false, reason: 'Not in command phase' };
      const plane = SkyHigh.PLANES.find(p => p.id === planeId);
      if (!plane) return { ok: false, reason: 'Invalid plane' };
      if (plane.unlockRound > Math.max(1, state.round - 2)) return { ok: false, reason: 'Not yet available used' };

      const usedCost = Math.round(plane.costM * 0.62 * 1_000_000);
      if (state.cash < usedCost) return { ok: false, reason: `Need $${(usedCost/1e6).toFixed(1)}M` };

      const id   = `U-${planeId.substring(0,2)}-${String(state.fleet.length + 1).padStart(3,'0')}`;
      const name = `Pre-Owned ${['Alpha','Bravo','Charlie','Delta','Echo'][state.fleet.length % 5]}`;
      // Used planes have reduced lifespan (already flown ~40% of life)
      const ageQtrs = Math.round((plane.lifespanQtrs || 48) * 0.40);
      state.fleet.push({ planeId, id, name, assignedRoute: null, ageQtrs, used: true });
      state.cash -= usedCost;
      state.actionPoints--;
      return { ok: true, planeId: id, costSpent: usedCost };
    },

    // ── PURCHASE FACILITY ──────────────────────────────────────
    purchaseFacility(airportId, facilityId) {
      if (!API.canTakeAction()) return { ok: false, reason: 'Not in command phase' };
      const fac = SkyHigh.AIRPORT_FACILITIES?.find(f => f.id === facilityId);
      if (!fac) return { ok: false, reason: 'Invalid facility' };

      state.facilities[airportId] = state.facilities[airportId] || [];
      if (state.facilities[airportId].includes(facilityId)) return { ok: false, reason: 'Already built' };

      const cost = fac.costM * 1_000_000;
      if (state.cash < cost) return { ok: false, reason: `Need $${fac.costM}M` };

      state.facilities[airportId].push(facilityId);
      state.cash -= cost;
      state.actionPoints--;

      // Apply one-time stat effects
      const b = fac.benefit;
      if (b.safetyShield)     state.safetyShield     = Math.min(100, state.safetyShield + b.safetyShield);
      if (b.servicePrestige)  state.servicePrestige   = Math.min(100, state.servicePrestige + b.servicePrestige);

      return { ok: true, facilityId, airportId };
    },

    // ── SKIP DELIVERY WITH CREDITS ─────────────────────────────
    skipDelivery(deliveryId) {
      const idx = state.deliveryQueue.findIndex(d => d.id === deliveryId);
      if (idx < 0) return { ok: false, reason: 'Not found in delivery queue' };
      if (state.credits < 2) return { ok: false, reason: 'Need 2 💎 Credits to skip delivery' };
      const d = state.deliveryQueue.splice(idx, 1)[0];
      const names = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot'];
      state.fleet.push({ planeId: d.planeType, id: d.id, name: `Sierra ${names[state.fleet.length % 6]}`, assignedRoute: null });
      state.credits -= 2;
      return { ok: true };
    },

    closeRoute(routeId) {
      if (!API.canTakeAction()) return { ok: false, reason: 'Not in command phase' };
      const idx = state.routes.findIndex(r => r.id === routeId);
      if (idx < 0) return { ok: false, reason: 'Route not found' };
      state.routes.splice(idx, 1);
      state.actionPoints--;
      return { ok: true };
    },

    buyPlane(planeId) {
      if (!API.canTakeAction()) return { ok: false, reason: 'Not in command phase' };
      const plane = SkyHigh.PLANES.find(p => p.id === planeId);
      if (!plane) return { ok: false, reason: 'Invalid plane' };
      if (plane.unlockRound > state.round) return { ok: false, reason: `${plane.name} unlocks at round ${plane.unlockRound}` };
      const cost = plane.costM * 1_000_000;
      if (state.cash < cost) return { ok: false, reason: `Need $${plane.costM}M` };

      const id = `${planeId.substring(0,2)}-${String(state.fleet.length + 1).padStart(3,'0')}`;
      const names = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel','India','Juliet'];
      const name = `Sierra ${names[state.fleet.length % names.length]}`;

      const deliveryQtrs = plane.deliveryQtrs || 0;
      state.cash -= cost;
      state.actionPoints--;

      if (deliveryQtrs > 0) {
        // Queue for future delivery
        state.deliveryQueue.push({
          id, name, planeType: planeId,
          deliveryRound: state.round + deliveryQtrs,
          purchasedRound: state.round,
        });
        return { ok: true, planeId: id, delivering: true, deliveryQtrs, deliveryRound: state.round + deliveryQtrs };
      } else {
        state.fleet.push({ planeId, id, name, assignedRoute: null, ageQtrs: 0 });
        return { ok: true, planeId: id, delivering: false };
      }
    },

    // ── FINANCING: TAKE A LOAN ────────────────────────────────
    takeLoan(loanTypeId, amount, termQtrs) {
      const loanType = SkyHigh.FINANCING.loanTypes.find(t => t.id === loanTypeId);
      if (!loanType) return { ok: false, reason: 'Invalid loan type' };
      if (amount < loanType.minAmount) return { ok: false, reason: `Minimum loan is $${(loanType.minAmount/1e6).toFixed(1)}M` };
      if (amount > loanType.maxAmount) return { ok: false, reason: `Maximum loan is $${(loanType.maxAmount/1e6).toFixed(0)}M` };
      if (!loanType.termOptions.includes(termQtrs)) return { ok: false, reason: 'Invalid term' };

      // Check credit limit
      const rating = SkyHigh.FINANCING.creditRatings.find(r => r.id === state.creditRating) || SkyHigh.FINANCING.creditRatings[2];
      const maxDebt = state.cash * rating.maxLoanMultiple;
      if ((state.totalDebt + amount) > maxDebt) return { ok: false, reason: `Debt limit reached for ${rating.id} rating ($${(maxDebt/1e6).toFixed(0)}M max)` };

      const baseRate   = state.currentBankRate;
      const spread     = rating.spread + (loanType.spreadBonus || 0);
      const interestRate = Math.max(0.005, baseRate + spread);
      const quarterlyRate = interestRate / 4;

      // Annuity payment formula
      const qPayment = amount * (quarterlyRate * Math.pow(1 + quarterlyRate, termQtrs)) /
                       (Math.pow(1 + quarterlyRate, termQtrs) - 1);

      const loanId = `LOAN-${state.round}-${state.loans.length + 1}`;
      state.loans.push({
        id: loanId,
        type: loanTypeId,
        name: loanType.name,
        principal: amount,
        outstanding: amount,
        interestRate,
        termQtrs,
        remainingQtrs: termQtrs,
        quarterlyPayment: Math.round(qPayment),
        takenRound: state.round,
      });

      state.cash += amount;
      state.totalDebt += amount;
      API._recalcCreditRating();
      return { ok: true, loanId, amount, interestRate, quarterlyPayment: Math.round(qPayment), termQtrs };
    },

    // ── FINANCING: GET FINANCE SUMMARY ────────────────────────
    getFinanceSummary() {
      const rating     = SkyHigh.FINANCING.creditRatings.find(r => r.id === state.creditRating) || SkyHigh.FINANCING.creditRatings[2];
      const baseRate   = state.currentBankRate;
      const totalQtrPayment = state.loans.reduce((s, l) => s + l.quarterlyPayment, 0);
      const totalInterestQtr = state.loans.reduce((s, l) => {
        const qRate = l.interestRate / 4;
        return s + Math.round(l.outstanding * qRate);
      }, 0);
      return {
        creditRating: state.creditRating,
        ratingColor: rating.color,
        ratingDesc: rating.desc,
        bankRate: baseRate,
        loans: state.loans,
        totalDebt: state.totalDebt,
        totalQtrPayment,
        totalInterestQtr,
        fuelReserves: state.fuelReserves,
        fuelReservePrice: state.fuelReservePrice,
        fuelReserveValueM: (state.fuelReserves * state.fuelReservePrice / 1e6).toFixed(2),
        currentFuelPrice: SkyHigh.ECONOMY.fuelPriceBase * state.fuelPriceMultiplier,
        fuelSavingPct: state.fuelReserves > 0 ?
          Math.max(0, 1 - state.fuelReservePrice / (SkyHigh.ECONOMY.fuelPriceBase * state.fuelPriceMultiplier)) : 0,
      };
    },

    // ── BULK FUEL PURCHASE ────────────────────────────────────
    bulkBuyFuel(tierId) {
      const tier = SkyHigh.FINANCING.fuelBulkTiers.find(t => t.id === tierId);
      if (!tier) return { ok: false, reason: 'Invalid tier' };

      const currentPrice = SkyHigh.ECONOMY.fuelPriceBase * state.fuelPriceMultiplier;
      const discountPrice = currentPrice * (1 - tier.discountPct);
      const totalCost = tier.litres * discountPrice;

      if (state.cash < totalCost) return { ok: false, reason: `Need $${(totalCost/1e6).toFixed(1)}M` };

      // Blend with existing reserves (weighted average price)
      if (state.fuelReserves > 0) {
        const existingValue = state.fuelReserves * state.fuelReservePrice;
        const newValue      = tier.litres * discountPrice;
        state.fuelReservePrice = (existingValue + newValue) / (state.fuelReserves + tier.litres);
      } else {
        state.fuelReservePrice = discountPrice;
      }
      state.fuelReserves += tier.litres;
      state.cash -= totalCost;

      return {
        ok: true,
        litres: tier.litres,
        pricePer: discountPrice.toFixed(4),
        totalCost,
        discountPct: tier.discountPct,
        reservesTotal: state.fuelReserves,
      };
    },

    // ── WORLD EVENTS: GET ACTIVE ──────────────────────────────
    getActiveWorldEvents() {
      return state.activeWorldEvents;
    },

    runMarketingCampaign(targetRegion) {
      if (!API.canTakeAction()) return { ok: false, reason: 'Not in command phase' };
      const cost = 1_500_000;
      if (state.cash < cost) return { ok: false, reason: 'Insufficient funds for campaign ($1.5M)' };
      state.cash -= cost;
      state.pendingEffects.push({ type: 'demandBoostRegion', region: targetRegion, mult: 1.15, rounds: 2 });
      state.actionPoints--;
      return { ok: true, cost };
    },

    investInSafety() {
      if (!API.canTakeAction()) return { ok: false, reason: 'Not in command phase' };
      const cost = 2_000_000;
      if (state.cash < cost) return { ok: false, reason: 'Insufficient funds ($2M)' };
      state.cash -= cost;
      state.safetyShield = Math.min(100, state.safetyShield + 8);
      state.actionPoints--;
      return { ok: true, cost };
    },

    investInCrewTraining() {
      if (!API.canTakeAction()) return { ok: false, reason: 'Not in command phase' };
      const cost = 1_800_000;
      if (state.cash < cost) return { ok: false, reason: 'Insufficient funds ($1.8M)' };
      state.cash -= cost;
      state.crewLoyalty = Math.min(100, state.crewLoyalty + 10);
      state.actionPoints--;
      return { ok: true, cost };
    },

    // ── CRISIS RESOLUTION ─────────────────────────────────────
    resolveCrisis(decisionId) {
      if (!state.activeCrisis) return { ok: false, reason: 'No active crisis' };

      const crisis = state.activeCrisis;
      let decision;

      if (crisis.isBoss) {
        const phase = crisis.phases[state.currentBossPhase];
        decision = phase.choices.find(c => c.id === decisionId);
      } else {
        decision = crisis.decisions.find(d => d.id === decisionId);
      }

      if (!decision) return { ok: false, reason: 'Invalid decision' };

      API._applyEffects(decision.effects);

      if (decision.effects.pendingCrisis) {
        state.pendingCrisis = decision.effects.pendingCrisis;
      }

      if (crisis.isBoss) {
        state.currentBossPhase++;
        if (state.currentBossPhase >= crisis.phases.length) {
          // Boss complete
          state.crisisHistory.push({ crisisId: crisis.id, round: state.round, resolved: true });
          state.activeCrisis = null;
          state.currentBossPhase = 0;
          state.crisisCount++;
          return { ok: true, bossComplete: true };
        }
        return { ok: true, bossComplete: false, nextPhase: crisis.phases[state.currentBossPhase] };
      } else {
        state.crisisHistory.push({ crisisId: crisis.id, round: state.round, resolved: true });
        state.activeCrisis = null;
        state.crisisCount++;
        return { ok: true, bossComplete: true };
      }
    },

    // ── ADVANCE PHASES ────────────────────────────────────────
    endCommandPhase() {
      if (state.phase !== 'COMMAND') return { ok: false };
      state.phase = 'CRISIS';
      const crisis = API._rollCrisis();
      return { ok: true, crisis };
    },

    endCrisisPhase() {
      if (state.phase !== 'CRISIS') return { ok: false };
      state.phase = 'RESULT';
      return API._calculateResults();
    },

    endResultPhase() {
      if (state.phase !== 'RESULT') return { ok: false };
      state.phase = 'REPORT';
      return { ok: true };
    },

    endReportPhase() {
      if (state.phase !== 'REPORT') return { ok: false };
      if (state.round >= 20) {
        return { ok: true, gameOver: true, legacyTitle: API._determineLegacyTitle() };
      }
      state.round++;
      state.stage = API.getStage();
      state.phase = 'COMMAND';
      state.actionPoints = 3 + (API._hasPerk('EXTRA_ACTION') ? 1 : 0);
      state.netThisRound = 0;

      // ── Process delivery queue ───────────────────────────────
      const delivered = [];
      const names = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel'];
      state.deliveryQueue = state.deliveryQueue.filter(d => {
        if (state.round >= d.deliveryRound) {
          state.fleet.push({ planeId: d.planeType, id: d.id, name: d.name, assignedRoute: null, ageQtrs: 0 });
          delivered.push(d);
          return false;
        }
        return true;
      });

      // ── Pay quarterly lease costs ────────────────────────────
      let leaseCostTotal = 0;
      state.leasedFleet.forEach(lp => {
        const costQtr = lp.leaseMonthlyCostM * 3 * 1_000_000;
        state.cash -= costQtr;
        leaseCostTotal += costQtr;
      });

      // ── Pay quarterly facility maintenance costs ─────────────
      let facCostTotal = 0;
      Object.values(state.facilities).forEach(facList => {
        facList.forEach(facId => {
          const fac = SkyHigh.AIRPORT_FACILITIES?.find(f => f.id === facId);
          if (fac) {
            const qtrCost = fac.monthlyCostM * 3 * 1_000_000;
            state.cash -= qtrCost;
            facCostTotal += qtrCost;
          }
        });
      });

      // ── Age owned fleet ──────────────────────────────────────
      state.fleet.forEach(f => { f.ageQtrs = (f.ageQtrs || 0) + 1; });

      // ── Early-game bonus cash (rounds 1-3) ───────────────────
      let bonusCash = 0;
      if (state.round <= 3 && state.routes.length > 0) {
        bonusCash = 2_000_000;
        state.cash += bonusCash;
      }

      // ── Process bank loans ───────────────────────────────────
      let loanPaymentTotal = 0;
      let loanInterestTotal = 0;
      const defaulted = [];
      state.loans = state.loans.filter(loan => {
        if (loan.remainingQtrs <= 0) return false; // already paid off
        const qRate = loan.interestRate / 4;
        const interestPortion = Math.round(loan.outstanding * qRate);
        const principalPortion = Math.min(loan.outstanding, loan.quarterlyPayment - interestPortion);
        const payment = loan.quarterlyPayment;

        if (state.cash >= payment) {
          state.cash -= payment;
          loan.outstanding = Math.max(0, loan.outstanding - principalPortion);
          loan.remainingQtrs--;
          loanPaymentTotal += payment;
          loanInterestTotal += interestPortion;
          state.interestPaidTotal += interestPortion;
          state.missedPayments = Math.max(0, state.missedPayments - 1);
        } else {
          // Missed payment — serious consequence
          state.missedPayments++;
          state.boardConfidence = _clamp(state.boardConfidence - 8);
          defaulted.push(loan.id);
          loan.interestRate = Math.min(0.25, loan.interestRate + 0.015); // penalty rate
          loan.remainingQtrs--;
        }
        state.totalDebt = Math.max(0, state.totalDebt - principalPortion);
        return loan.outstanding > 0 && loan.remainingQtrs > 0;
      });
      API._recalcCreditRating();

      // ── Update bank rate ─────────────────────────────────────
      const rates = SkyHigh.FINANCING.baseRateByRound;
      state.currentBankRate = rates[Math.min(state.round - 1, rates.length - 1)];

      // ── Roll world events ────────────────────────────────────
      const newEvents = API._rollWorldEvents();

      // ── Tick active world events ─────────────────────────────
      state.activeWorldEvents = state.activeWorldEvents.filter(ev => {
        ev.roundsRemaining--;
        return ev.roundsRemaining > 0;
      });

      // ── Burn fuel from reserves ──────────────────────────────
      state.fuelSpentThisQtr = 0; // reset — actual spend tracked in _calcRouteExpenses

      API._processPassiveDrain();
      API._decayFuelPrice();
      API._checkMilestones();
      return { ok: true, gameOver: false, delivered, leaseCostTotal, facCostTotal, bonusCash, loanPaymentTotal, loanInterestTotal, defaulted, newEvents };
    },

    // ── ROUTE PROJECTION (for map UI) ─────────────────────────
    projectRoute(originId, destId, planeId, opts = {}) {
      const origin = SkyHigh.GeoUtils.getAirport(originId);
      const dest   = SkyHigh.GeoUtils.getAirport(destId);
      const plane  = SkyHigh.PLANES.find(p => p.id === planeId);
      if (!origin || !dest || !plane) return null;

      const distKm     = SkyHigh.GeoUtils.distance(origin.lat, origin.lon, dest.lat, dest.lon);
      const band       = SkyHigh.GeoUtils.getDistanceBand(distKm);
      const flightTimeH = Math.round((distKm / plane.cruiseKmh) * 10) / 10;

      if (distKm > plane.rangeKm) return { feasible: false, distKm: Math.round(distKm), flightTimeH, reason: 'Out of range' };

      const mockRoute = {
        distBand: band, originId, destId, planeId, status: 'ACTIVE', distKm,
        routeType:      opts.routeType      || 'PAX',
        flightsPerWeek: opts.flightsPerWeek || 7,
        fareMultiplier: opts.fareMultiplier || 1.0,
        bizClass:       opts.bizClass       || false,
      };
      const revenue  = API._calcRouteRevenue(mockRoute);
      const cost     = API._calcRouteExpenses(mockRoute);
      const profit   = revenue - cost;
      const openCost = API._calcRouteOpenCost(plane, distKm);

      return {
        feasible: true,
        distKm: Math.round(distKm),
        distBand: band,
        flightTimeH,
        projectedRevenue: revenue,
        projectedCost: cost,
        projectedProfit: profit,
        openCost,
        breakEvenRound: profit > 0 ? Math.ceil(openCost / profit) : null,
        demandScore: Math.round((origin.demand + dest.demand) / 2),
        businessDemand: Math.round((origin.demand + dest.demand) * 0.22),
        touristDemand:  Math.round((origin.demand + dest.demand) * 0.78),
        seatBreakdown: { economy: plane.economySeats || plane.seats, business: plane.businessSeats || 0, first: plane.firstSeats || 0 },
      };
    },

    // ── INTERNAL HELPERS ──────────────────────────────────────
    // ── WORLD EVENTS ROLL ──────────────────────────────────────
    _rollWorldEvents() {
      if (!SkyHigh.WORLD_EVENTS) return [];
      const triggered = [];
      SkyHigh.WORLD_EVENTS.forEach(ev => {
        if (ev.triggerRound !== state.round) return;
        if (state.worldEventHistory.includes(ev.id)) return;
        state.worldEventHistory.push(ev.id);
        state.activeWorldEvents.push({
          eventId: ev.id,
          name: ev.name,
          type: ev.type,
          icon: ev.icon,
          color: ev.color,
          desc: ev.desc,
          roundsRemaining: ev.duration,
          demandMod: ev.demandImpact,
          bizMod: ev.bizImpact,
          cargoMod: ev.cargoImpact,
          fuelMod: ev.fuelImpact,
          affectedRegions: ev.affectedRegions,
          affectedAirports: ev.affectedAirports,
        });
        // Apply fuel impact immediately
        if (ev.fuelImpact && ev.fuelImpact !== 1.0) {
          state.fuelPriceMultiplier = Math.max(0.5, Math.min(2.5, state.fuelPriceMultiplier * ev.fuelImpact));
        }
        triggered.push(ev);
      });
      return triggered;
    },

    // ── CREDIT RATING RECALC ───────────────────────────────────
    _recalcCreditRating() {
      const debtToCash = state.totalDebt / Math.max(1, state.cash);
      const missed = state.missedPayments;
      let ratingIdx;
      if      (missed >= 3)          ratingIdx = 7; // D
      else if (missed === 2)         ratingIdx = 6; // CCC
      else if (missed === 1)         ratingIdx = 5; // B
      else if (debtToCash > 12)     ratingIdx = 6; // CCC
      else if (debtToCash > 8)      ratingIdx = 5; // B
      else if (debtToCash > 5)      ratingIdx = 4; // BB
      else if (debtToCash > 3)      ratingIdx = 3; // BBB
      else if (debtToCash > 1.5)    ratingIdx = 2; // A
      else if (debtToCash > 0.5)    ratingIdx = 1; // AA
      else                           ratingIdx = 0; // AAA
      // Board confidence also affects rating
      if (state.boardConfidence < 40) ratingIdx = Math.min(7, ratingIdx + 1);
      if (state.boardConfidence > 85) ratingIdx = Math.max(0, ratingIdx - 1);
      state.creditRating = SkyHigh.FINANCING.creditRatings[ratingIdx].id;
    },

    // ── WORLD EVENT DEMAND MODIFIER FOR A ROUTE ───────────────
    _getEventDemandMod(originId, destId, isCargoRoute) {
      let demandMod  = 1.0;
      let bizMod     = 1.0;
      let cargoMod   = 1.0;

      const origin = SkyHigh.GeoUtils.getAirport(originId);
      const dest   = SkyHigh.GeoUtils.getAirport(destId);

      state.activeWorldEvents.forEach(ev => {
        const evData = SkyHigh.WORLD_EVENTS?.find(e => e.id === ev.eventId);
        if (!evData) return;
        // Check if this route is affected
        const affAirports = evData.affectedAirports;
        const affRegions  = evData.affectedRegions;
        let affected = !affAirports && !affRegions; // global event

        if (affAirports) {
          affected = affAirports.includes(originId) || affAirports.includes(destId);
        }
        if (!affected && affRegions && origin && dest) {
          const oCountry = SkyHigh.WORLD_COUNTRIES?.[origin.countryIso];
          const dCountry = SkyHigh.WORLD_COUNTRIES?.[dest.countryIso];
          affected = (oCountry && affRegions.includes(oCountry.region)) ||
                     (dCountry && affRegions.includes(dCountry.region));
        }
        if (affected) {
          demandMod  *= ev.demandMod;
          bizMod     *= ev.bizMod;
          cargoMod   *= ev.cargoMod;
        }
      });
      return isCargoRoute ? cargoMod : { pax: demandMod, biz: bizMod };
    },

    _applyDoctrine(doctrine) {
      if (!doctrine) return;
      const b = doctrine.bonuses;
      if (b.demandMult)         state.demandMultiplier   = (state.demandMultiplier || 1) * b.demandMult;
      if (b.fareMult)           state.fareMult           = (state.fareMult || 1) * b.fareMult;
      if (b.servicePrestigeMult) state.servicePrestige   = Math.round(state.servicePrestige * b.servicePrestigeMult);
      if (b.boardConfMult)      state.boardConfidence    = Math.round(state.boardConfidence * b.boardConfMult);
      if (b.crewLoyaltyMult)    state.crewLoyalty        = Math.round(state.crewLoyalty * b.crewLoyaltyMult);
      if (b.safetyShieldMult)   state.safetyShield       = Math.round(state.safetyShield * b.safetyShieldMult);
      if (b.crisisChance)       state._crisisMod         = b.crisisChance;
      state.doctrineApplied = true;
    },

    _applyHubBonus() {
      // Hub airport gives +5 to all competencies
      const hub = SkyHigh.GeoUtils.getAirport(state.hubAirportId);
      if (hub && hub.hubLevel >= 4) {
        state.boardConfidence = Math.min(100, state.boardConfidence + 5);
        state.safetyShield    = Math.min(100, state.safetyShield + 5);
      }
    },

    _rollCrisis() {
      // Boss crises override at specific rounds (fixed triggerRound)
      const boss = SkyHigh.CRISES.find(c => c.isBoss && c.triggerRound === state.round);
      if (boss) {
        state.activeCrisis = boss;
        state.currentBossPhase = 0;
        return { type: 'BOSS', crisis: boss };
      }

      // ── RUNWAY AIRSPACE CRISIS — triggered by active world events ──
      const runwayCrisis = SkyHigh.CRISES.find(c => c.isRunwayCrisis);
      const hasAirspaceClosure = state.activeWorldEvents.some(ev => {
        const evData = SkyHigh.WORLD_EVENTS?.find(e => e.id === ev.eventId);
        return evData?.type === 'POLITICAL' || evData?.type === 'DISASTER';
      });
      const hasRoutes = state.routes.length > 0;
      const alreadySeen = state.crisisHistory.slice(-4).find(h => h.crisisId === 'RUNWAY_AIRSPACE_CLOSURE');
      if (runwayCrisis && hasAirspaceClosure && hasRoutes && !alreadySeen && Math.random() < 0.55) {
        state.activeCrisis = runwayCrisis;
        state.currentBossPhase = 0;
        return { type: 'BOSS', crisis: runwayCrisis };
      }

      // Pending escalated crisis?
      if (state.pendingCrisis) {
        const escalated = SkyHigh.CRISES.find(c => c.id === state.pendingCrisis);
        state.pendingCrisis = null;
        if (escalated) {
          state.activeCrisis = escalated;
          return { type: 'ESCALATED', crisis: escalated };
        }
      }

      // Random crisis roll
      const baseCrisisChance = 0.65;
      const safetyBonus = (state.safetyShield / 100) * 0.25;
      const doctrineMod = state._crisisMod || 0;
      const chance = Math.max(0.15, baseCrisisChance - safetyBonus + doctrineMod);

      if (Math.random() > chance) {
        return { type: 'NONE' };
      }

      const eligible = SkyHigh.CRISES.filter(c =>
        !c.isBoss &&
        c.stage.includes(state.stage) &&
        !state.crisisHistory.slice(-3).find(h => h.crisisId === c.id) // avoid immediate repeats
      );

      if (!eligible.length) return { type: 'NONE' };

      const crisis = eligible[Math.floor(Math.random() * eligible.length)];
      state.activeCrisis = crisis;
      return { type: 'CRISIS', crisis };
    },

    _calculateResults() {
      let totalRevenue = 0;
      let totalExpenses = 0;
      const routeResults = [];

      // Quarterly fleet maintenance cost
      const maintenanceCost = state.fleet.reduce((sum, f) => {
        const plane = SkyHigh.PLANES.find(p => p.id === f.planeId);
        return sum + (plane ? plane.costM * 1_000_000 * SkyHigh.ECONOMY.maintenancePctFleet : 0);
      }, 0);
      totalExpenses += maintenanceCost;

      // Route revenue/cost
      state.routes.forEach(route => {
        if (route.status !== 'ACTIVE') return;
        const rev = API._calcRouteRevenue(route);
        const cost = API._calcRouteExpenses(route);
        const profit = rev - cost;
        route.lastRevenue = rev;
        route.lastProfit  = profit;
        route.profitHistory.push(profit);
        totalRevenue += rev;
        totalExpenses += cost;
        routeResults.push({ routeId: route.id, revenue: rev, cost, profit });
      });

      // CEO perks bonus
      if (API._hasPerk('CEO_BONUS_2M')) totalRevenue += 2_000_000;

      // Cargo doctrine bonus
      const doctrine = SkyHigh.DOCTRINES.find(d => d.id === state.doctrineId);
      if (doctrine && doctrine.bonuses.cargoBonusRev) {
        totalRevenue *= (1 + doctrine.bonuses.cargoBonusRev);
      }

      const net = totalRevenue - totalExpenses;
      state.cash += net;
      state.revenue = totalRevenue;
      state.expenses = totalExpenses;
      state.netThisRound = net;
      state.totalRevenue += totalRevenue;

      // Natural stat drift
      API._applyStatDrift();

      // Record for history
      state.roundHistory.push({
        round: state.round,
        cash: state.cash,
        revenue: totalRevenue,
        expenses: totalExpenses,
        net,
        boardConfidence: state.boardConfidence,
        safetyShield: state.safetyShield,
        crewLoyalty: state.crewLoyalty,
        servicePrestige: state.servicePrestige,
      });

      return {
        ok: true,
        totalRevenue, totalExpenses, net,
        maintenanceCost, routeResults,
        cashAfter: state.cash,
      };
    },

    _calcRouteRevenue(route) {
      const origin = SkyHigh.GeoUtils.getAirport(route.originId);
      const dest   = SkyHigh.GeoUtils.getAirport(route.destId);
      const plane  = SkyHigh.PLANES.find(p => p.id === route.planeId);
      if (!origin || !dest || !plane) return 0;

      const band = route.distBand || SkyHigh.GeoUtils.getDistanceBand(route.distKm || 2000);

      // ── Commercial (Cargo) route ──────────────────────────────
      if (route.routeType === 'CARGO') {
        const cargoBase  = SkyHigh.ECONOMY.ticketFareBase[band].economy * 0.6;
        const cargoTons  = Math.round((origin.demand + dest.demand) / 4);
        const cargoMult  = route.fareMultiplier || 1.0;
        const eventMod   = API._getEventDemandMod(route.originId, route.destId, true);
        return Math.round(cargoBase * cargoTons * 13 * (state.fareMult || 1) * cargoMult * eventMod);
      }

      // ── PAX route ─────────────────────────────────────────────
      const ecoFare  = SkyHigh.ECONOMY.ticketFareBase[band].economy;
      const bizFare  = SkyHigh.ECONOMY.ticketFareBase[band].business;

      // Base demand from airports
      const baseDemand = (origin.demand + dest.demand) / 2;
      const archetype  = SkyHigh.ARCHETYPES[origin.demandProfile || 'MIXED'] || SkyHigh.ARCHETYPES.MIXED;
      const volatility = archetype.demandVolatility;
      const demandNoise = 1 + (Math.random() - 0.5) * volatility;

      // World event modifier
      const eventMods = API._getEventDemandMod(route.originId, route.destId, false);
      const paxEventMod = eventMods.pax || 1.0;
      const bizEventMod = eventMods.biz || 1.0;

      // Passenger demand split: business, tourism, VFR
      const split = state.passengerDemandSplit;
      const totalDemand = Math.round(baseDemand * demandNoise * state.demandMultiplier * paxEventMod);
      const bizTravelers = Math.round(totalDemand * split.business * bizEventMod);
      const tourTravelers = Math.round(totalDemand * split.tourism);
      const vfrTravelers  = Math.round(totalDemand * split.vfr);
      const paxDemand = bizTravelers + tourTravelers + vfrTravelers;

      // Load factor
      const loadFactor = Math.min(0.97, SkyHigh.ECONOMY.loadFactorBase +
        (state.servicePrestige / 100) * 0.10 - (Math.random() * SkyHigh.ECONOMY.loadFactorVariance));

      const fpw = route.flightsPerWeek || 7;
      const flightsPerQuarter = fpw * 13;

      const totalSeats = plane.seats;
      const bizSeats   = route.bizClass ? (plane.businessSeats || 0) : 0;
      const ecoSeats   = totalSeats - bizSeats;

      const paxPerFlight = Math.min(totalSeats, Math.round(paxDemand / flightsPerQuarter));
      // Business travelers preferentially take biz class seats
      const bizPax  = Math.min(bizSeats, Math.round(Math.min(paxPerFlight, bizTravelers / flightsPerQuarter)));
      const ecoPax  = Math.min(ecoSeats, paxPerFlight - bizPax);

      const routeFareMult = (route.fareMultiplier || 1.0) * (state.fareMult || 1);
      const ecoRevenue    = ecoPax  * flightsPerQuarter * ecoFare * routeFareMult * loadFactor;
      const bizRevenue    = bizPax  * flightsPerQuarter * bizFare * routeFareMult * loadFactor;

      // Store demand breakdown on route for UI
      route._lastDemandBreakdown = { biz: bizTravelers, tour: tourTravelers, vfr: vfrTravelers, total: paxDemand };

      return Math.round(ecoRevenue + bizRevenue);
    },

    _calcRouteExpenses(route) {
      const plane = SkyHigh.PLANES.find(p => p.id === route.planeId);
      if (!plane) return 0;

      const distKm   = route.distKm || 2000;
      const band     = route.distBand || SkyHigh.GeoUtils.getDistanceBand(distKm);
      const bandData = SkyHigh.MAP_DATA.distanceBands[band];

      const flightTimeH       = distKm / plane.cruiseKmh;
      const fpw               = route.flightsPerWeek || 7;
      const flightsPerQuarter = fpw * 13;

      // Fuel cost — use reserves at locked price when available
      const litresNeeded = plane.fuelLitersPerKm * distKm * flightsPerQuarter;
      let fuelPrice;
      if (state.fuelReserves >= litresNeeded) {
        fuelPrice = state.fuelReservePrice; // use pre-purchased fuel at locked price
        state.fuelReserves -= litresNeeded;
        state.fuelSpentThisQtr += litresNeeded;
      } else if (state.fuelReserves > 0) {
        // Use what's left in reserves, pay market for the rest
        const reservePortion = state.fuelReserves / litresNeeded;
        fuelPrice = state.fuelReservePrice * reservePortion +
                    SkyHigh.ECONOMY.fuelPriceBase * state.fuelPriceMultiplier * (1 - reservePortion);
        state.fuelSpentThisQtr += state.fuelReserves;
        state.fuelReserves = 0;
      } else {
        fuelPrice = SkyHigh.ECONOMY.fuelPriceBase * state.fuelPriceMultiplier;
      }
      const fuelCost = litresNeeded * fuelPrice * bandData.fuelMult;

      // Crew cost
      const crewCost = plane.crewRequired * flightTimeH * SkyHigh.ECONOMY.crewCostBase *
                       bandData.crewMult * flightsPerQuarter;

      // Ops cost
      const opsCost = plane.opCostPerKm * distKm * flightsPerQuarter;

      return Math.round(fuelCost + crewCost + opsCost);
    },

    _calcRouteOpenCost(plane, distKm) {
      // One-time route establishment cost
      const base = 500_000;
      const distFactor = Math.min(3, distKm / 2000);
      return Math.round(base * (1 + distFactor));
    },

    _applyEffects(effects) {
      if (!effects) return;
      if (effects.cash)            state.cash            += effects.cash;
      if (effects.boardConfidence) state.boardConfidence  = _clamp(state.boardConfidence + effects.boardConfidence);
      if (effects.safetyShield)    state.safetyShield     = _clamp(state.safetyShield + effects.safetyShield);
      if (effects.crewLoyalty)     state.crewLoyalty      = _clamp(state.crewLoyalty + effects.crewLoyalty);
      if (effects.servicePrestige) state.servicePrestige  = _clamp(state.servicePrestige + effects.servicePrestige);
      if (effects.demandMult)      state.demandMultiplier = Math.max(0.3, state.demandMultiplier * effects.demandMult);
      if (effects.fareMult)        state.fareMult         = Math.max(0.5, (state.fareMult || 1) * effects.fareMult);
      // customerCare is a hidden competency — tracked quietly, revealed after runway crises
      if (typeof effects.customerCare === 'number') {
        state.customerCare = Math.max(0, Math.min(100, (state.customerCare || 50) + effects.customerCare));
      }
    },

    // ── CUSTOMER CARE OUTCOME ─────────────────────────────────
    // Called after the runway crisis final phase resolves. Returns the
    // outcome tier + applies lasting effects based on accumulated score.
    resolveCustomerCareOutcome() {
      const score = state.customerCare || 50;
      let tier, title, desc, extraEffects;
      if (score >= 70) {
        tier = 'EXCELLENT';
        title = 'Exceptional Customer Recovery';
        desc  = 'Your transparent communication and generous compensation turned a crisis into a loyalty milestone. Passengers are sharing their stories — positively.';
        extraEffects = { servicePrestige: +8, demandMult: 1.05, boardConfidence: +5 };
      } else if (score >= 45) {
        tier = 'ADEQUATE';
        title = 'Adequate Crisis Response';
        desc  = 'Most passengers accepted your response. A few negative reviews appeared, but the airline\'s reputation remained largely intact.';
        extraEffects = {};
      } else if (score >= 20) {
        tier = 'POOR';
        title = 'Poor Customer Care';
        desc  = 'Passengers felt neglected. Negative reviews are impacting bookings in affected corridors. The board wants answers.';
        extraEffects = { servicePrestige: -6, boardConfidence: -5 };
      } else {
        tier = 'CRISIS';
        title = 'Customer Care Crisis';
        desc  = 'Social media backlash is severe. #NeverFlyingAgain trends for 72 hours. Demand drops measurably.';
        extraEffects = { servicePrestige: -12, demandMult: 0.88, boardConfidence: -10 };
      }
      API._applyEffects(extraEffects);
      return { tier, title, desc, score, extraEffects };
    },

    getCustomerCareScore() { return state.customerCare || 50; },

    _applyStatDrift() {
      // Natural drift each round toward 70
      const target = 70;
      const speed  = 0.05;
      state.boardConfidence = _drift(state.boardConfidence, target, speed);
      state.safetyShield    = _drift(state.safetyShield, target, speed);
      state.crewLoyalty     = _drift(state.crewLoyalty, target, speed);
      state.servicePrestige = _drift(state.servicePrestige, target, speed);
    },

    _processPassiveDrain() {
      // Crew costs without routes
      if (state.routes.length === 0 && state.fleet.length > 0) {
        state.crewLoyalty = _clamp(state.crewLoyalty - 3);
      }
    },

    _decayFuelPrice() {
      // Fuel price random walk
      const change = (Math.random() - 0.5) * 0.20;
      state.fuelPriceMultiplier = Math.max(0.7, Math.min(2.0, state.fuelPriceMultiplier + change));
    },

    _checkMilestones() {
      SkyHigh.MILESTONES.forEach(m => {
        if (state.unlockedMilestones.includes(m.id)) return;
        let triggered = false;
        if (m.round && state.round >= m.round) triggered = true;
        if (m.trigger) {
          try {
            const s = state;
            const routes = s.routes.length;
            const cash = s.cash;
            const safetyShield = s.safetyShield;
            const servicePrestige = s.servicePrestige;
            const boardConfidence = s.boardConfidence;
            const crewLoyalty = s.crewLoyalty;
            const crises = s.crisisCount;
            triggered = eval(m.trigger); // Safe: only uses game state vars
          } catch(e) {}
        }
        if (triggered) {
          state.unlockedMilestones.push(m.id);
          if (m.rewardType === 'LIVERY' && m.unlockMilestone) {
            const livery = SkyHigh.LIVERIES.find(l => l.unlockMilestone === m.id);
            if (livery) state.unlockedLiveries.push(livery.id);
          }
          if (m.rewardType === 'PERK') state.perks.push(m.id);
          return m;
        }
      });
    },

    _hasPerk(perkId) { return state.perks.includes(perkId); },

    _determineLegacyTitle() {
      const s = {
        boardConfidence: state.boardConfidence,
        servicePrestige: state.servicePrestige,
        safetyShield:    state.safetyShield,
        crewLoyalty:     state.crewLoyalty,
        cash:            state.cash,
        routes:          state.routes.length,
        crisisCount:     state.crisisCount,
      };
      const title = SkyHigh.LEGACY_TITLES.find(t => t.condition(s));
      return title || SkyHigh.LEGACY_TITLES[SkyHigh.LEGACY_TITLES.length - 1];
    },

    getBoardReaction() {
      const avg = (state.boardConfidence + state.servicePrestige + state.safetyShield + state.crewLoyalty) / 4;
      const pool = avg >= 80 ? 'excellent' : avg >= 65 ? 'good' : avg >= 50 ? 'neutral' : avg >= 35 ? 'poor' : 'crisis';
      const lines = SkyHigh.BOARD_REACTIONS[pool];
      return lines[Math.floor(Math.random() * lines.length)];
    },

    getTopRoutes(n = 5) {
      return [...state.routes]
        .sort((a, b) => b.lastProfit - a.lastProfit)
        .slice(0, n);
    },

    getRouteStatus(routeId) {
      const route = state.routes.find(r => r.id === routeId);
      if (!route) return null;
      return route.lastProfit > 0 ? 'PROFITABLE' : route.lastProfit < 0 ? 'LOSS' : 'IDLE';
    },
  };

  // ── UTIL ──────────────────────────────────────────────────
  function _clamp(val, min = 0, max = 100) { return Math.min(max, Math.max(min, Math.round(val))); }
  function _drift(val, target, speed) { return _clamp(val + (target - val) * speed); }

  return API;
})();
