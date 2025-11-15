import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import createHttpError from "http-errors";
import env from "../config/env";
import { logWebhookDelivery, registerGoogleWebhook, syncGoogleEvents } from "../services/googleCalendar.service";
import logger from "../lib/logger";

const watchRequestSchema = z.object({
  calendarId: z.string().optional(),
  ttlSeconds: z.coerce.number().min(60).max(604800).optional(),
});

export const registerGoogleWatch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = watchRequestSchema.parse(req.body);
    const data = await registerGoogleWebhook(body.calendarId, body.ttlSeconds);
    res.status(201).json({
      message: "Watch registered",
      channelId: data.id,
      resourceId: data.resourceId,
      expiration: data.expiration,
    });
  } catch (error) {
    next(error);
  }
};

export const handleGoogleWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const verificationToken = env.GOOGLE_WEBHOOK_VERIFICATION_TOKEN;
    if (verificationToken) {
      const channelToken = req.header("X-Goog-Channel-Token");
      if (channelToken !== verificationToken) {
        throw createHttpError(401, "Invalid webhook token");
      }
    }

    const channelId = req.header("X-Goog-Channel-Id");
    const resourceId = req.header("X-Goog-Resource-Id");
    const eventType = req.header("X-Goog-Resource-State");

    await logWebhookDelivery({
      channelId,
      resourceId,
      eventType,
      body: req.body,
    });

    logger.info(
      {
        channelId,
        resourceId,
        eventType,
      },
      "google_webhook_received",
    );

    // Opportunistic sync
    void syncGoogleEvents({
      timeMin: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    }).catch((error) => logger.error({ error }, "webhook_sync_failed"));

    res.status(202).json({ received: true });
  } catch (error) {
    next(error);
  }
};

