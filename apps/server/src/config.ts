import { z } from "zod";

const envSchema = z.object({
  SERVER_PORT: z
    .string()
    .default("3000")
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://swarm:swarm_dev_password@localhost:55432/swarm"),
  OPENAI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("gpt-4o-mini"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(16)
    .default("dev-secret-change-me-for-production"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
});

export type ServerConfig = z.infer<typeof envSchema>;

export const loadServerConfig = (env: NodeJS.ProcessEnv = process.env): ServerConfig => {
  return envSchema.parse(env);
};
