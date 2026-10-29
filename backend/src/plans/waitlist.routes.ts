import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../security/validate.ts";
import { rateLimit } from "../security/rate-limit.ts";
import { WaitlistModel } from "./waitlist.model.ts";
import { sendWaitlistNotification } from "./mailer.ts";
import { WAITLIST_PLANS } from "./plans.ts";

const router = Router();
const limiter = rateLimit({ windowMs: 60 * 60_000, max: 10, message: "Too many requests, try again later" });

const schema = z.object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    plan: z.enum(WAITLIST_PLANS),
}).strict();

router.post("/", limiter, validateBody(schema), async (req, res) => {
    const { email, plan } = req.body as z.infer<typeof schema>;
    try {
        const created = await WaitlistModel.updateOne(
            { email, plan },
            { $setOnInsert: { email, plan, ipAddress: req.ip, createdAt: new Date() } },
            { upsert: true },
        );
        if (created.upsertedCount > 0) {
            void (async () => {
                if (await sendWaitlistNotification({ email, plan })) await WaitlistModel.updateOne({ email, plan }, { notified: true });
            })().catch(err => console.error("waitlist email failed:", (err as Error).message));
        }
        return res.status(201).json({ message: "You're on the list" });
    } catch (err) {
        console.error("waitlist save failed:", err);
        return res.status(500).json({ message: "Could not join the waitlist, please try again" });
    }
});

export default router;
