import { Router } from "express";
import { createEvent, listEvents } from "../controllers/events.controller";

const router = Router();

router.get("/", listEvents);
router.post("/", createEvent);

export default router;

