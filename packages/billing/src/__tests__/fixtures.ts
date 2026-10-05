/**
 * Two catalogs shaped like the real ones, so the tests exercise what each app
 * actually does: DeckCP sells per seat with capability flags; BlastCP sells a
 * flat price with limits and a metered image allowance (lifetime on Free).
 */
import { DOLLAR_MICROS } from "../money.js";
import { defineCatalog, type BasePlan } from "../catalog.js";

type DeckPlanId = "free" | "pro" | "team";
interface DeckPlan extends BasePlan<DeckPlanId> {
  removesBranding: boolean;
}

export const deckCatalog = defineCatalog<DeckPlanId, DeckPlan>({
  plans: {
    free: { id: "free", name: "Free", monthlyUnitAmountCents: 0, perSeat: false, removesBranding: false },
    pro: { id: "pro", name: "Pro", monthlyUnitAmountCents: 1600, perSeat: true, removesBranding: true },
    team: { id: "team", name: "Team", monthlyUnitAmountCents: 2400, perSeat: true, removesBranding: true },
  },
  order: ["free", "pro", "team"],
  free: "free",
});

type BlastPlanId = "free" | "hobby" | "pro" | "agency";
interface BlastPlan extends BasePlan<BlastPlanId> {
  maxChannels: number | null;
}

export const IMAGE_METER = "image_credit";

export const blastCatalog = defineCatalog<BlastPlanId, BlastPlan>({
  plans: {
    free: {
      id: "free",
      name: "Free",
      monthlyUnitAmountCents: 0,
      perSeat: false,
      maxChannels: 1,
      allowances: { [IMAGE_METER]: { amount: 0.5 * DOLLAR_MICROS, resets: false } },
    },
    hobby: {
      id: "hobby",
      name: "Hobby",
      monthlyUnitAmountCents: 1200,
      perSeat: false,
      maxChannels: 3,
      allowances: { [IMAGE_METER]: { amount: 3 * DOLLAR_MICROS } },
    },
    pro: {
      id: "pro",
      name: "Pro",
      monthlyUnitAmountCents: 3900,
      perSeat: false,
      maxChannels: 10,
      allowances: { [IMAGE_METER]: { amount: 10 * DOLLAR_MICROS } },
    },
    agency: {
      id: "agency",
      name: "Agency",
      monthlyUnitAmountCents: 14900,
      perSeat: false,
      maxChannels: null,
      allowances: { [IMAGE_METER]: { amount: 50 * DOLLAR_MICROS } },
    },
  },
  order: ["free", "hobby", "pro", "agency"],
  free: "free",
});
