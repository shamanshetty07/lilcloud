export type Plan = {
  id: "free" | "plus" | "pro";
  name: string;
  price: string;
  period: string;
  storage: string;
  blurb: string;
  features: string[];
  available: boolean;
};

// paid plans are announced but not purchasable yet
export const PLANS: Plan[] = [
  {
    id: "free", name: "Free", price: "$0", period: "forever", storage: "1 GB", available: true,
    blurb: "Everything you need to get started.",
    features: ["1 GB of storage", "Upload, download and delete anytime", "Private to your account", "Items up to 25 MB"],
  },
  {
    id: "plus", name: "Plus", price: "$5", period: "per year", storage: "50 GB", available: false,
    blurb: "Room for your photos, documents and projects.",
    features: ["50 GB of storage", "Everything in Free", "Priority support"],
  },
  {
    id: "pro", name: "Pro", price: "$15", period: "per year", storage: "100 GB", available: false,
    blurb: "Maximum space for everything you keep.",
    features: ["100 GB of storage", "Everything in Plus", "Early access to new features"],
  },
];
