import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { syncGoogleEvents } from "../services/googleCalendar.service";

const syncRequestSchema = z.object({
  calendarId: z.string().min(1).optional(),
  integrationId: z.string().min(1).optional(),
  timeMin: z.string().datetime().optional(),
  timeMax: z.string().datetime().optional(),
});

export const triggerSync = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = syncRequestSchema.parse(req.body);
    const result = await syncGoogleEvents(input);
    res.json({
      message: "Sync completed",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

