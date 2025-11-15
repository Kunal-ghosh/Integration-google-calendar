export type SyncOptions = {
  calendarId?: string;
  integrationId?: string;
  timeMin?: string;
  timeMax?: string;
};

export type EventFilter = {
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
  order?: "asc" | "desc";
};

export type CreateEventInput = {
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  attendees?: Array<{ email: string; displayName?: string }>;
  meetLink?: boolean;
};

