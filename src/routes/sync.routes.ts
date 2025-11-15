import { Router } from "express";
import { triggerSync } from "../controllers/sync.controller";

const router = Router();

router.post("/events", triggerSync);

export default router;

