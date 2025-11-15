-- CreateTable
CREATE TABLE "IntegrationAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "scope" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "status" TEXT,
    "location" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "updatedAtRemote" TIMESTAMP(3),
    "hangoutLink" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalendarEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "IntegrationAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalendarWatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "googleChannelId" TEXT,
    "calendarId" TEXT NOT NULL,
    "resourceId" TEXT,
    "integrationId" TEXT NOT NULL,
    "expiry" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalendarWatch_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "IntegrationAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "eventType" TEXT,
    "channelId" TEXT,
    "resourceId" TEXT,
    "integrationId" TEXT,
    "payload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "IntegrationAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "IntegrationAccount_provider_idx" ON "IntegrationAccount"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationAccount_provider_email_key" ON "IntegrationAccount"("provider", "email");

-- CreateIndex
CREATE INDEX "CalendarEvent_integrationId_idx" ON "CalendarEvent"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_providerEventId_calendarId_key" ON "CalendarEvent"("providerEventId", "calendarId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarWatch_googleChannelId_key" ON "CalendarWatch"("googleChannelId");

-- CreateIndex
CREATE INDEX "CalendarWatch_calendarId_integrationId_idx" ON "CalendarWatch"("calendarId", "integrationId");
