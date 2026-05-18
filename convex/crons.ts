import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Refresh long-lived IG tokens (60-day life, refreshable) once a day.
crons.daily(
  "refresh-instagram-tokens",
  { hourUTC: 7, minuteUTC: 0 },
  internal.accounts.refreshTokens,
);

export default crons;
