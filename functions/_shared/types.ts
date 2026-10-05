export interface Env {
  DB: D1Database;
  TURNSTILE_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  DAILY_SALT: string;
  CAMPAIGN: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
}

export interface EntryPayload {
  name?: string;
  phone?: string;
  flavour?: string;
  optIn?: boolean;
  consent?: boolean;
  turnstileToken?: string;
}

export const FLAVOURS = [
  'Orange', 'Tropical', 'Guava', 'Lemos', 'Naartjie', 'Mango', 'Pineapple'
];
