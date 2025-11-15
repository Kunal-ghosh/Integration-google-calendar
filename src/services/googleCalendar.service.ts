import type { IntegrationAccount, Prisma } from "@prisma/client";
import { Credentials } from "google-auth-library";
import type { oauth2_v2 } from "googleapis";
import { calendar_v3, google } from "googleapis";
import createHttpError from "http-errors";
import dayjs from "dayjs";
import { randomUUID } from "crypto";
import env from "../config/env";
import prisma from "../lib/prisma";
import logger from "../lib/logger";
import { buildGoogleAuthUrl, calendarClient, createOAuthClient } from "../lib/googleClient";
import { CreateEventInput, SyncOptions } from "../types/google";

const PROVIDER = "google_calendar";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async <T>(operationName: string, fn: () => Promise<T>) => {
  const maxRetries = 3;
  let attempt = 0;
  let delay = 500;

  while (true) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      const status =
        (error as { code?: number }).code ??
        (error as { status?: number }).status ??
        (error as { response?: { status?: number } }).response?.status;
      const retryable = typeof status === "number" && RETRYABLE_STATUS.has(status);

      if (!retryable || attempt > maxRetries) {
        throw error;
      }

      const retriesLeft = maxRetries - attempt + 1;
      logger.warn(
        {
          attemptNumber: attempt,
          retriesLeft,
          message: (error as Error).message,
          status,
          operationName,
        },
        "google_api_retry",
      );

      await sleep(delay);
      delay = Math.min(delay * 2, 4000);
    }
  }
};

const mapTokens = (integration: IntegrationAccount): Credentials => ({
  access_token: integration.accessToken,
  refresh_token: integration.refreshToken ?? undefined,
  expiry_date: integration.tokenExpiresAt?.getTime(),
});

const persistTokens = async (integration: IntegrationAccount, tokens: Credentials) =>
  prisma.integrationAccount.update({
    where: { id: integration.id },
    data: {
      accessToken: tokens.access_token ?? integration.accessToken,
      refreshToken: tokens.refresh_token ?? integration.refreshToken,
      scope: tokens.scope ?? integration.scope,
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : integration.tokenExpiresAt,
    },
  });

const ensureFreshAccessToken = async (integration: IntegrationAccount) => {
  const needsRefresh =
    !integration.tokenExpiresAt || dayjs(integration.tokenExpiresAt).isBefore(dayjs().add(60, "seconds"));

  if (!needsRefresh) {
    return integration;
  }

  if (!integration.refreshToken) {
    throw createHttpError(401, "Missing refresh token. Re-authenticate with Google.");
  }

  const client = createOAuthClient({
    refresh_token: integration.refreshToken,
  });

  const refreshed = await withRetry("google.refreshToken", async () => {
    const result = await client.refreshAccessToken();
    return result.credentials;
  });

  if (!refreshed.access_token) {
    throw createHttpError(502, "Google did not return a new access token");
  }

  return persistTokens(integration, refreshed);
};

export const getGoogleAuthUrl = (state?: string) => buildGoogleAuthUrl(state);

const upsertIntegrationAccount = async (email: string, tokens: Credentials, profile: oauth2_v2.Schema$Userinfo) => {
  const existing = await prisma.integrationAccount.findFirst({
    where: { provider: PROVIDER, email },
  });

  if (!existing && !tokens.refresh_token) {
    throw createHttpError(400, "Google did not return a refresh token. Remove the app from https://myaccount.google.com/permissions and try again.");
  }

  if (!tokens.access_token && !existing?.accessToken) {
    throw createHttpError(502, "Google did not return an access token");
  }

  if (!existing) {
    return prisma.integrationAccount.create({
      data: {
        provider: PROVIDER,
        email,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? "",
        scope: tokens.scope,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        metadata: profile as Prisma.InputJsonValue,
      },
    });
  }

  return prisma.integrationAccount.update({
    where: { id: existing.id },
    data: {
      accessToken: tokens.access_token ?? existing.accessToken,
      refreshToken: tokens.refresh_token ?? existing.refreshToken,
      scope: tokens.scope ?? existing.scope,
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : existing.tokenExpiresAt,
      metadata: profile as Prisma.InputJsonValue,
    },
  });
};

export const completeGoogleOAuth = async (code: string) => {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens) {
    throw createHttpError(502, "Unable to exchange authorization code with Google");
  }

  const authClient = createOAuthClient(tokens);
  const oauth2 = google.oauth2("v2");
  const { data: profile } = await oauth2.userinfo.get({ auth: authClient });
  const email = profile.email;

  if (!email) {
    throw createHttpError(400, "Google account does not expose an email address");
  }

  const integration = await upsertIntegrationAccount(email, tokens, profile);
  logger.info({ email }, "google_account_connected");
  return integration;
};

export const getIntegrationOrThrow = async (integrationId?: string) => {
  const integration = await prisma.integrationAccount.findFirst({
    where: integrationId ? { id: integrationId, provider: PROVIDER } : { provider: PROVIDER },
  });

  if (!integration) {
    throw createHttpError(404, "No Google Calendar account connected");
  }

  return integration;
};

const mapEventToEntity = (event: calendar_v3.Schema$Event, integrationId: string, calendarId: string) => ({
  provider: PROVIDER,
  providerEventId: event.id!,
  calendarId,
  integrationId,
  summary: event.summary ?? null,
  description: event.description ?? null,
  location: event.location ?? null,
  status: event.status ?? null,
  startTime: event.start?.dateTime ? new Date(event.start.dateTime) : event.start?.date ? new Date(event.start.date) : null,
  endTime: event.end?.dateTime ? new Date(event.end.dateTime) : event.end?.date ? new Date(event.end.date) : null,
  updatedAtRemote: event.updated ? new Date(event.updated) : null,
  hangoutLink: event.hangoutLink ?? null,
  rawPayload: event as Prisma.InputJsonValue,
});

const upsertEvents = async (integrationId: string, calendarId: string, events: calendar_v3.Schema$Event[]) => {
  let persisted = 0;
  for (const event of events) {
    if (!event.id) continue;
    await prisma.calendarEvent.upsert({
      where: {
        providerEventId_calendarId: {
          providerEventId: event.id,
          calendarId,
        },
      },
      update: mapEventToEntity(event, integrationId, calendarId),
      create: mapEventToEntity(event, integrationId, calendarId),
    });
    persisted += 1;
  }
  return persisted;
};

export const syncGoogleEvents = async (options: SyncOptions = {}) => {
  const calendarId = options.calendarId ?? env.DEFAULT_CALENDAR_ID;
  const baseIntegration = await getIntegrationOrThrow(options.integrationId);
  const integration = await ensureFreshAccessToken(baseIntegration);
  const calendar = calendarClient(mapTokens(integration));

  let pageToken: string | undefined;
  const collected: calendar_v3.Schema$Event[] = [];

  do {
    const response = await withRetry("calendar.events.list", () =>
      calendar.events.list({
        calendarId,
        maxResults: 2500,
        singleEvents: true,
        orderBy: "updated",
        pageToken,
        timeMin: options.timeMin,
        timeMax: options.timeMax,
      }),
    );
    const items = response.data.items ?? [];
    collected.push(...items);
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  const upserted = await upsertEvents(integration.id, calendarId, collected);

  return {
    remoteCount: collected.length,
    eventsPersisted: upserted,
    calendarId,
  };
};

export const createGoogleEvent = async (input: CreateEventInput) => {
  const calendarId = input.calendarId ?? env.DEFAULT_CALENDAR_ID;
  const baseIntegration = await getIntegrationOrThrow();
  const integration = await ensureFreshAccessToken(baseIntegration);
  const calendar = calendarClient(mapTokens(integration));

  const requestBody: calendar_v3.Schema$Event = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: input.start,
    end: input.end,
    attendees: input.attendees,
    conferenceData: input.meetLink
      ? {
          createRequest: {
            requestId: randomUUID(),
          },
        }
      : undefined,
  };

  const { data } = await withRetry("calendar.events.insert", () =>
    calendar.events.insert({
      calendarId,
      requestBody,
      conferenceDataVersion: input.meetLink ? 1 : undefined,
    }),
  );

  if (!data.id) {
    throw createHttpError(502, "Google failed to create the event");
  }

  await upsertEvents(integration.id, calendarId, [data]);
  return data;
};

export const registerGoogleWebhook = async (calendarId?: string, ttlSeconds = 3600) => {
  if (!env.GOOGLE_WEBHOOK_CALLBACK_URL) {
    throw createHttpError(400, "GOOGLE_WEBHOOK_CALLBACK_URL is not configured");
  }

  const effectiveCalendarId = calendarId ?? env.DEFAULT_CALENDAR_ID;
  const baseIntegration = await getIntegrationOrThrow();
  const integration = await ensureFreshAccessToken(baseIntegration);
  const calendar = calendarClient(mapTokens(integration));

  const { data } = await withRetry("calendar.events.watch", () =>
    calendar.events.watch({
      calendarId: effectiveCalendarId,
      requestBody: {
        id: randomUUID(),
        type: "web_hook",
        address: env.GOOGLE_WEBHOOK_CALLBACK_URL!,
        token: env.GOOGLE_WEBHOOK_VERIFICATION_TOKEN,
        params: {
          ttl: `${ttlSeconds}`,
        },
      },
    }),
  );

  await prisma.calendarWatch.create({
    data: {
      provider: PROVIDER,
      calendarId: effectiveCalendarId,
      integrationId: integration.id,
      googleChannelId: data.id ?? undefined,
      resourceId: data.resourceId ?? undefined,
      expiry: data.expiration ? new Date(Number(data.expiration)) : null,
      metadata: data as Prisma.InputJsonValue,
    },
  });

  return data;
};

export const logWebhookDelivery = async (payload: {
  channelId?: string | null;
  resourceId?: string | null;
  eventType?: string | null;
  body: unknown;
}) =>
  prisma.webhookLog.create({
    data: {
      provider: PROVIDER,
      channelId: payload.channelId ?? undefined,
      resourceId: payload.resourceId ?? undefined,
      eventType: payload.eventType ?? undefined,
      payload: payload.body as Prisma.InputJsonValue,
    },
  });

