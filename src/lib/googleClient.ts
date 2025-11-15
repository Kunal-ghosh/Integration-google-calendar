import { google } from "googleapis";
import type { Credentials } from "google-auth-library";
import env from "../config/env";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];

export const createOAuthClient = (tokens?: Credentials) => {
  const client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
  if (tokens) {
    client.setCredentials(tokens);
  }
  return client;
};

export const buildGoogleAuthUrl = (state?: string) =>
  createOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
  });

export const calendarClient = (tokens: Credentials) =>
  google.calendar({
    version: "v3",
    auth: createOAuthClient(tokens),
  });

export const oauth2Client = () => google.oauth2("v2");

