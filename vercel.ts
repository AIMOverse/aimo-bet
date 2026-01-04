import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [
    // Run every 30 minutes
    {
      path: "/api/agents/cron",
      schedule: "*/30 * * * *",
    },
  ],
};
