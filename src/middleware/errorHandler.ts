import type { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import logger from "../lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  const error = createHttpError(err.status || err.statusCode || 500, err.message || "Internal Server Error", {
    expose: err.expose ?? err.status < 500,
  });

  logger.error(
    {
      name: err.name,
      message: err.message,
      stack: err.stack,
      status: error.status,
      context: err.context,
    },
    "request_failed",
  );

  res.status(error.status).json({
    error: {
      message: error.message,
      status: error.status,
      details: err.details,
    },
  });
};

