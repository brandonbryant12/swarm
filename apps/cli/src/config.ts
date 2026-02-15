import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://swarm:swarm_dev_password@localhost:55432/swarm"),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_ACCESS_KEY: z.string().min(1).default("minioadmin"),
  S3_SECRET_KEY: z.string().min(1).default("minioadmin"),
  S3_BUCKET_RAW: z.string().min(1).default("swarm-raw"),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  REDDIT_USER_AGENT: z
    .string()
    .min(1)
    .default("swarm-fraud-monitor/0.1.0 (contact: security@example.com)"),
  SCRAPE_RATE_LIMIT_MS: z
    .string()
    .default("1200")
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  SCRAPE_MAX_RETRY_ATTEMPTS: z
    .string()
    .default("5")
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(10)),
  SCRAPE_RETRY_BASE_DELAY_MS: z
    .string()
    .default("1000")
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
});

export type AppConfig = z.infer<typeof envSchema>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  return envSchema.parse(env);
};
