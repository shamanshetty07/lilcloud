import { Schema, model, type InferSchemaType } from "mongoose";

const authLogSchema = new Schema(
  {
    eventType: { type: String, enum: ["login", "logout"], required: true, index: true },
    userId: { type: Number, index: true },
    email: { type: String, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
    status: { type: String, enum: ["success", "failure"], required: true },
    ipAddress: { type: String },
    details: { type: Schema.Types.Mixed },
  },
  { collection: "auth_logs", versionKey: false },
);

export type AuthLog = InferSchemaType<typeof authLogSchema>;
export const AuthLogModel = model("AuthLog", authLogSchema);
