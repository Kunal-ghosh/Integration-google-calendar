import { Router } from "express";
import { handleGoogleCallback, initiateGoogleAuth } from "../controllers/auth.controller";

const router = Router();

router.get("/google", initiateGoogleAuth);
router.get("/google/callback", handleGoogleCallback);

export default router;

