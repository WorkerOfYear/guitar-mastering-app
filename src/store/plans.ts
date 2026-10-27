import type { DataState } from "./data";

/** The id the old single plan gets, the same on every device so their syncs agree. */
export const LEGACY_PLAN_ID = "plan-legacy";

/** Data from before several plans: its single plan becomes "Мой план", chosen for "Сегодня" as it was. */
export function withPlans<T extends Partial<DataState>>(state: T): T {
  if (state.plans || !state.template) return state;
  const { template, ...rest } = state;
  const filled = template.warmup.length + template.new.length + template.review.length > 0;
  const plans: Pick<DataState, "plans" | "planId"> = filled ? { plans: [{ id: LEGACY_PLAN_ID, name: "Мой план", ...template }], planId: LEGACY_PLAN_ID } : { plans: [] };
  return { ...rest, ...plans } as unknown as T;
}

/** The plan "Сегодня" plays, if one is chosen and still exists. */
export const currentPlan = (s: Pick<DataState, "plans" | "planId">) => (s.planId ? s.plans?.find((p) => p.id === s.planId) : undefined);
