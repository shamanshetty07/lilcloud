import { useState } from "react";
import { HardDrives, CloudArrowUp, LockKey, FileArrowUp, Headphones, Rocket, Stack } from "@phosphor-icons/react";
import { PricingSection, type PricingPlan } from "./ui/pricing-section.tsx";
import { PLANS } from "../lib/plans.ts";
import { WaitlistForm } from "./WaitlistForm.tsx";
import { navigate } from "../lib/router.tsx";
import { useAuth } from "../lib/auth.tsx";

type PlanId = "plus" | "pro";

const icons: Record<string, React.ReactNode> = {
  storage: <HardDrives weight="fill" />,
  transfer: <CloudArrowUp weight="fill" />,
  private: <LockKey weight="fill" />,
  size: <FileArrowUp weight="fill" />,
  support: <Headphones weight="fill" />,
  early: <Rocket weight="fill" />,
  everything: <Stack weight="fill" />,
};

const iconFor = (feature: string) => {
  const f = feature.toLowerCase();
  if (f.includes("storage")) return icons.storage;
  if (f.includes("upload")) return icons.transfer;
  if (f.includes("private")) return icons.private;
  if (f.includes("items up to")) return icons.size;
  if (f.includes("support")) return icons.support;
  if (f.includes("early")) return icons.early;
  return icons.everything;
};

const accents: Record<string, string> = { free: "#5fd08a", plus: "#b4b4bb", pro: "#e5b94e" };

export function PlanCards() {
  const { user } = useAuth();
  const [open, setOpen] = useState<PlanId | null>(null);
  const active = PLANS.find(p => p.id === open);

  const plans: PricingPlan[] = PLANS.map(p => ({
    id: p.id,
    name: p.name,
    description: `${p.storage} storage. ${p.blurb}`,
    price: p.available ? p.price : { monthly: p.amount, annually: p.amount },
    accent: accents[p.id],
    featured: p.id === "plus",
    glow: p.id === "free" ? 0.9 : undefined,
    badge: p.available ? undefined : "Coming soon",
    cta: p.available
      ? { label: user ? "Your current plan" : "Get started free", onClick: () => navigate(user ? "/app" : "/signup") }
      : { label: "Join the waitlist", onClick: () => setOpen(p.id as PlanId) },
    features: p.features.map(label => ({ label, icon: iconFor(label) })),
  }));

  return (
    <>
      <PricingSection
        badge="Pricing"
        title="Start free. Grow when you need to."
        description="Every account includes 1 GB at no cost. Larger plans are launching soon. Join the waitlist and we'll let you know the moment they open."
        plans={plans}
        showBillingToggle={false}
        defaultBilling="annually"
        periodLabel="/year"
        featuresLabel="What's included"
        footnote="Paid plans are billed yearly once available. Prices shown in USD."
        className="bg-bg! dark:bg-bg!"
      />

      {active && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal onClick={() => setOpen(null)}>
          <div className="w-full max-w-sm rounded-xl border border-line-strong bg-bg p-6" onClick={e => e.stopPropagation()}>
            <WaitlistForm plan={active.id as PlanId} planName={active.name} onDone={() => setOpen(null)} />
          </div>
        </div>
      )}
    </>
  );
}
