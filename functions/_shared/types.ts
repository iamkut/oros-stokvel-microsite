export interface Env {
  DB: D1Database;
  TURNSTILE_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  DAILY_SALT: string;
  CAMPAIGN: string;
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
  'Original', 'Naartjie', 'Mango', 'Pineapple', 'Twist', 'Tropical', 'Guava'
];
