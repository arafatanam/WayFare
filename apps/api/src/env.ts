import type { ItineraryWorkflowParams } from "./workflows/itinerary";

export interface ImportMessage {
  importId: string;
  userId: string;
}

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  KV: KVNamespace;
  ASSETS: Fetcher;
  TRIP_ROOM: DurableObjectNamespace;
  IMPORT_QUEUE: Queue<ImportMessage>;
  ITINERARY_WORKFLOW: Workflow<ItineraryWorkflowParams>;

  APP_URL: string;
  /** "true" bypasses auth, quotas and paywalls for local R&D. See lib/devmode.ts. */
  DEV_MODE?: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  AI_PROVIDER?: "openrouter" | "groq" | "selfhosted";
  AI_MODEL: string;
  AI_VISION_MODEL: string;
  OPENROUTER_API_KEY?: string;
  CF_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  CF_AIG_TOKEN?: string;
  /** Groq (OpenAI-compatible). GORQ_API_KEY is accepted as an alias for the misspelled name. */
  GROQ_API_KEY?: string;
  GORQ_API_KEY?: string;
  GROQ_MODEL?: string;
  GROQ_VISION_MODEL?: string;
  SELFHOSTED_AI_URL?: string;
  SELFHOSTED_AI_KEY?: string;
  SELFHOSTED_AI_MODEL?: string;

  GOOGLE_PLACES_API_KEY?: string;
  ROUTING_URL?: string;

  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;

  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO?: string;
  SUPERWALL_WEBHOOK_SECRET?: string;

  TINYBIRD_TOKEN?: string;
  TINYBIRD_HOST?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  emailVerified: boolean;
}

export type AppEnv = { Bindings: Env; Variables: { user: AuthUser | null } };
