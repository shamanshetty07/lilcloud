import { Schema, model } from "mongoose";

const waitlistSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    plan: { type: String, enum: ["plus", "pro"], required: true },
    userId: { type: Number },
    ipAddress: { type: String },
    notified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "waitlist", versionKey: false },
);
waitlistSchema.index({ email: 1, plan: 1 }, { unique: true });

export const WaitlistModel = model("Waitlist", waitlistSchema);
