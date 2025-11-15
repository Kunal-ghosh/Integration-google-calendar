import { Router } from "express";
import authRouter from "./auth.routes";
import eventsRouter from "./events.routes";
import syncRouter from "./sync.routes";
import webhookRouter from "./webhook.routes";

const router = Router();

router.use("/auth", authRouter);
router.use("/events", eventsRouter);
router.use("/sync", syncRouter);
router.use("/webhook", webhookRouter);

export default router;

