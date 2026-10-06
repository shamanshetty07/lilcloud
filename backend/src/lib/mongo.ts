import mongoose from "mongoose";
import { env } from "./env.ts";

export async function connectMongo() {
  await mongoose.connect(env.MONGODB_URI);
}
