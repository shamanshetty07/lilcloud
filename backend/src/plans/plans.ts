const GB = 1024 ** 3;

export const PLANS = {
    free: { name: "Free", limitBytes: 1 * GB },
    plus: { name: "Plus", limitBytes: 50 * GB },
    pro: { name: "Pro", limitBytes: 100 * GB },
} as const;

export type PlanId = keyof typeof PLANS;
export const WAITLIST_PLANS = ["plus", "pro"] as const;
export const currentPlanFor = (_userId: number): PlanId => "free";
