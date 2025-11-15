import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  GOOGLE_REDIRECT_URI: z.string().url("GOOGLE_REDIRECT_URI must be a valid URL"),
  DEFAULT_CALENDAR_ID: z.string().default("primary"),
  GOOGLE_WEBHOOK_CALLBACK_URL: z
    .string()
    .url("GOOGLE_WEBHOOK_CALLBACK_URL must be a valid URL")
    .optional(),
  GOOGLE_WEBHOOK_VERIFICATION_TOKEN: z.string().optional(),
});

const env = envSchema.parse(process.env);

export type AppEnv = typeof env;

export default env;

