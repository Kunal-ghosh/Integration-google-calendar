import type { Request, Response } from "express";

export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(404).json({
    error: {
      message: "Resource not found",
      status: 404,
    },
  });
};

