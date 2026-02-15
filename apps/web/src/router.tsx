import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { authClient } from "./lib/auth-client";
import { AuthPanel } from "./components/AuthPanel";
import { ChatPanel } from "./components/ChatPanel";
import { StatsPanel } from "./components/StatsPanel";

function RootLayout() {
  const { data: session } = authClient.useSession();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">Swarm Console</div>
          <div className="status-line">
            {session?.user ? `Signed in as ${session.user.email}` : "Signed out"}
          </div>
        </div>

        <nav className="nav">
          <Link to="/" activeProps={{ className: "active" }}>
            Chat
          </Link>
          <Link to="/ops" activeProps={{ className: "active" }}>
            Ops
          </Link>
        </nav>
      </header>

      <Outlet />
    </div>
  );
}

function ChatRouteComponent() {
  return (
    <div className="grid two">
      <ChatPanel />
      <AuthPanel />
    </div>
  );
}

function OpsRouteComponent() {
  return (
    <div className="grid two">
      <StatsPanel />
      <AuthPanel />
    </div>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ChatRouteComponent,
});

const opsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ops",
  component: OpsRouteComponent,
});

const routeTree = rootRoute.addChildren([indexRoute, opsRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
