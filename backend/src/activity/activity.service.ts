import { ActivityLogModel, type ActivityLog } from "./activity.model.ts";

type activityData = Omit<ActivityLog, "timestamp">;


export const logActivity = async (data: Partial<activityData> & Pick<activityData, "eventType" | "userId" | "status">) => {
  try {
    await ActivityLogModel.create(data);
  } catch (err) {
    console.error("activity log failed:", err);
  }
};
