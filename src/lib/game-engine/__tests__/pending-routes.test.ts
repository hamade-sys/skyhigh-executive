import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  activatePendingRoutes,
  buildAutoRebidsForTeam,
  mergeAutoRebidsIntoTeam,
} from "../pending-routes";
import type { Route, Team } from "@/types/game";

function team(partial: Partial<Team> & Pick<Team, "id">): Team {
  return {
    id: partial.id,
    name: partial.name ?? "Test Air",
    code: partial.code ?? "TST",
    color: partial.color ?? "#336699",
    hubCode: partial.hubCode ?? "DXB",
    secondaryHubCodes: partial.secondaryHubCodes ?? [],
    doctrine: partial.doctrine ?? "budget-expansion",
    controlledBy: partial.controlledBy ?? "human",
    cashUsd: partial.cashUsd ?? 10_000_000,
    totalDebtUsd: partial.totalDebtUsd ?? 0,
    brandPts: partial.brandPts ?? 50,
    opsPts: partial.opsPts ?? 50,
    customerLoyaltyPct: partial.customerLoyaltyPct ?? 50,
    brandValue: partial.brandValue ?? 0,
    flags: partial.flags ?? new Set(),
    fleet: partial.fleet ?? [],
    routes: partial.routes ?? [],
    airportLeases: partial.airportLeases ?? {},
    slotsByAirport: partial.slotsByAirport ?? {},
    pendingSlotBids: partial.pendingSlotBids ?? [],
    sliders: partial.sliders ?? {
      staff: 2,
      marketing: 2,
      service: 2,
      rewards: 2,
      operations: 2,
      customerService: 2,
    },
    sliderStreaks: partial.sliderStreaks ?? {
      staff: { level: 2, quarters: 0 },
      marketing: { level: 2, quarters: 0 },
      service: { level: 2, quarters: 0 },
      rewards: { level: 2, quarters: 0 },
      operations: { level: 2, quarters: 0 },
      customerService: { level: 2, quarters: 0 },
    },
    decisions: partial.decisions ?? [],
    financialsByQuarter: partial.financialsByQuarter ?? [],
    insurancePolicy: partial.insurancePolicy ?? "none",
    fuelTanks: partial.fuelTanks ?? { small: 0, medium: 0, large: 0 },
    fuelStorageLevelL: partial.fuelStorageLevelL ?? 0,
    fuelStorageAvgCostPerL: partial.fuelStorageAvgCostPerL ?? 0,
    cargoStorageActivations: partial.cargoStorageActivations ?? [],
    hubInvestments: partial.hubInvestments ?? {
      fuelReserveTankHubs: [],
      maintenanceDepotHubs: [],
      premiumLoungeHubs: [],
      opsExpansionSlots: 0,
    },
    labourRelationsScore: partial.labourRelationsScore ?? 70,
    isPlayer: partial.isPlayer ?? true,
  } as Team;
}

describe("buildAutoRebidsForTeam", () => {
  it("rebids both endpoints for a pending IST→LIS route", () => {
    const pendingRoute: Route = {
      id: "r1",
      originCode: "IST",
      destCode: "LIS",
      distanceKm: 3000,
      aircraftIds: ["a1"],
      dailyFrequency: 1,
      pricingTier: "standard",
      econFare: 200,
      busFare: null,
      firstFare: null,
      cargoRatePerTonne: null,
      status: "pending",
      openQuarter: 3,
      avgOccupancy: 0,
      quarterlyRevenue: 0,
      quarterlyFuelCost: 0,
      quarterlySlotCost: 0,
      isCargo: false,
      consecutiveQuartersActive: 0,
      pendingBidPrices: { IST: 50_000 },
      consecutiveLosingQuarters: 0,
    };
    const t = team({
      id: "t1",
      routes: [pendingRoute],
      airportLeases: { IST: { slots: 0, totalWeeklyCost: 0 } },
    });
    const rebids = buildAutoRebidsForTeam(t, 5);
    assert.ok(rebids.IST);
    assert.ok(rebids.LIS, "dest endpoint must rebid even without stored price");
    assert.equal(rebids.IST.slots, 7);
    const quartersPending = 5 - 3;
    const expectedIst = Math.round(50_000 * Math.min(3, 1 + 0.15 * quartersPending));
    assert.equal(rebids.IST.price, expectedIst);
  });
});

describe("activatePendingRoutes", () => {
  it("activates when both endpoints have enough weekly slots", () => {
    const pendingRoute: Route = {
      id: "r1",
      originCode: "IST",
      destCode: "LIS",
      distanceKm: 3000,
      aircraftIds: ["a1"],
      dailyFrequency: 1,
      pricingTier: "standard",
      econFare: 200,
      busFare: null,
      firstFare: null,
      cargoRatePerTonne: null,
      status: "pending",
      openQuarter: 3,
      avgOccupancy: 0,
      quarterlyRevenue: 0,
      quarterlyFuelCost: 0,
      quarterlySlotCost: 0,
      isCargo: false,
      consecutiveQuartersActive: 0,
      consecutiveLosingQuarters: 0,
    };
    const t = team({
      id: "t1",
      routes: [pendingRoute],
      airportLeases: {
        IST: { slots: 7, totalWeeklyCost: 0 },
        LIS: { slots: 7, totalWeeklyCost: 0 },
      },
    });
    const { team: updated, activatedCount } = activatePendingRoutes(t, true);
    assert.equal(activatedCount, 1);
    assert.equal(updated.routes[0].status, "active");
  });
});

describe("mergeAutoRebidsIntoTeam", () => {
  it("merges rebids into pendingSlotBids", () => {
    const t = team({ id: "t1" });
    const merged = mergeAutoRebidsIntoTeam(
      t,
      { DXB: { slots: 4, price: 60_000 } },
      2,
    );
    assert.equal(merged.pendingSlotBids?.length, 1);
    assert.equal(merged.pendingSlotBids?.[0].airportCode, "DXB");
    assert.equal(merged.pendingSlotBids?.[0].slots, 4);
  });
});
