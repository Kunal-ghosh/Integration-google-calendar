import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { createGoogleEvent } from "../services/googleCalendar.service";

const listQuerySchema = z.object({
  status: z.string().optional(),
  calendarId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const createEventSchema = z.object({
  calendarId: z.string().optional(),
  summary: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.object({
    dateTime: z.string().datetime(),
    timeZone: z.string().optional(),
  }),
  end: z.object({
    dateTime: z.string().datetime(),
    timeZone: z.string().optional(),
  }),
  attendees: z
    .array(
      z.object({
        email: z.string().email(),
        displayName: z.string().optional(),
      }),
    )
    .optional(),
  meetLink: z.boolean().optional(),
});

export const listEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const where: Prisma.CalendarEventWhereInput = {
      provider: "google_calendar",
    };

    if (query.calendarId) {
      where.calendarId = query.calendarId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.from || query.to) {
      where.startTime = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    const events = await prisma.calendarEvent.findMany({
      where,
      orderBy: {
        startTime: query.order,
      },
      take: query.limit,
    });

    res.json({
      count: events.length,
      events,
    });
  } catch (error) {
    next(error);
  }
};

export const createEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createEventSchema.parse(req.body);
    const event = await createGoogleEvent(body);
    res.status(201).json({
      message: "Event created",
      event,
    });
  } catch (error) {
    next(error);
  }
};

