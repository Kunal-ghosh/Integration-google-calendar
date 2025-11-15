import { Router } from "express";
import { handleGoogleWebhook, registerGoogleWatch } from "../controllers/webhook.controller";

const router = Router();

router.post("/google", handleGoogleWebhook);
router.post("/google/watch", registerGoogleWatch);

export default router;

