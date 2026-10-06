import { Schema, model, type InferSchemaType } from "mongoose";

const activityLogSchema = new Schema(
  {
    eventType: { type: String, required: true, index: true },
    userId: { type: Number, required: true, index: true },
    fileId: { type: String, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
    nodeId: { type: String },
    status: { type: String, enum: ["success", "failure"], required: true },
    ipAddress: { type: String },
    details: { type: Schema.Types.Mixed },
  },
  { collection: "activity_logs", versionKey: false },
);

export type ActivityLog = InferSchemaType<typeof activityLogSchema>;
export const ActivityLogModel = model("ActivityLog", activityLogSchema);
