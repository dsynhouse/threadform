// Only server modules import this adapter. No environment values are bundled
// into browser code; Supabase uses the publishable key and the user's JWT.
export const env = {
  ...process.env,
  THREADFORM_BACKEND: "supabase",
  PINTEREST_APP_ID: process.env.PINTEREST_APP_ID,
  PINTEREST_APP_SECRET: process.env.PINTEREST_APP_SECRET,
  PINTEREST_REDIRECT_URI: process.env.PINTEREST_REDIRECT_URI,
  INTEGRATION_ENCRYPTION_KEY: process.env.INTEGRATION_ENCRYPTION_KEY,
  DB: undefined as D1Database | undefined,
  STORAGE: undefined as StudioBucket | undefined,
  ASSETS: undefined as Fetcher | undefined,
};
