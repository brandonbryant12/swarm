import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "@swarm/server/contracts";

const link = new RPCLink({
  url: "/rpc",
  fetch: (request, init) =>
    fetch(request, {
      ...init,
      credentials: "include",
    }),
});

export const orpc = createORPCClient(link) as RouterClient<AppRouter>;
