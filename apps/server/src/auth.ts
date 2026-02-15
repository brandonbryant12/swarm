import { betterAuth } from "better-auth";
import type { ServerConfig } from "./config.js";

export const createAuth = (config: ServerConfig) =>
  betterAuth({
    secret: config.BETTER_AUTH_SECRET,
    baseURL: `${config.BETTER_AUTH_URL}/api/auth`,
    trustedOrigins: [config.WEB_ORIGIN, config.BETTER_AUTH_URL],
    emailAndPassword: {
      enabled: true,
    },
  });
