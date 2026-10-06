import { AuthLogModel, type AuthLog } from "./auth-log.model.ts";

type authLogData = Omit<AuthLog, "timestamp">;


export const logAuthEvent = async (data: Partial<authLogData> & Pick<authLogData, "eventType" | "status">) => {
  try {
    await AuthLogModel.create(data);
  } catch (err) {
    console.error("auth log failed:", err);
  }
};
