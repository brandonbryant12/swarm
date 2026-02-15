import "dotenv/config";
import { serve } from "@hono/node-server";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Pool } from "pg";
import { loadServerConfig } from "./config.js";
import { createAuth } from "./auth.js";
import { appRouter } from "./router.js";

const config = loadServerConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL });
const auth = createAuth(config);

const rpcHandler = new RPCHandler(appRouter);
const app = new Hono();

app.use(
  "*",
  cors({
    origin: config.WEB_ORIGIN,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

app.get("/health", (c) => {
  return c.json({ status: "ok", now: new Date().toISOString() });
});

app.on(["GET", "POST"], "/api/auth/*", async (c) => {
  return auth.handler(c.req.raw);
});

app.use("/rpc/*", async (c, next) => {
  const { matched, response } = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: {
      headers: c.req.raw.headers,
      pool,
      config,
      auth,
    },
  });

  if (matched) {
    return c.newResponse(response.body, response);
  }

  await next();
});

const shutdown = async () => {
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

serve(
  {
    fetch: app.fetch,
    port: config.SERVER_PORT,
  },
  (info) => {
    console.log(`server_listening http://localhost:${info.port}`);
  },
);
