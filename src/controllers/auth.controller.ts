import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { completeGoogleOAuth, getGoogleAuthUrl } from "../services/googleCalendar.service";

export const initiateGoogleAuth = (req: Request, res: Response) => {
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const url = getGoogleAuthUrl(state);
  res.json({ url });
};

export const handleGoogleCallback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    if (!code) {
      throw createHttpError(400, "Missing ?code parameter from Google");
    }

    const integration = await completeGoogleOAuth(code);
    res.json({
      message: "Google Calendar account connected",
      integrationId: integration.id,
      email: integration.email,
    });
  } catch (error) {
    next(error);
  }
};

