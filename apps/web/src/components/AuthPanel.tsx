import { useState } from "react";
import { authClient } from "../lib/auth-client";

export function AuthPanel() {
  const { data: session, isPending, refetch } = authClient.useSession();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("Analyst");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      if (mode === "signin") {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) {
          throw new Error(result.error.message ?? "Sign in failed");
        }
      } else {
        const result = await authClient.signUp.email({ name, email, password });
        if (result.error) {
          throw new Error(result.error.message ?? "Sign up failed");
        }
      }
      await refetch();
      setPassword("");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(false);
    }
  };

  const signOut = async () => {
    await authClient.signOut();
    await refetch();
  };

  if (isPending) {
    return <div className="card">Loading session...</div>;
  }

  if (session?.user) {
    return (
      <div className="card stack">
        <h3>Signed In</h3>
        <div className="kv">
          <div className="k">Email</div>
          <div>{session.user.email}</div>
          <div className="k">User ID</div>
          <div style={{ fontFamily: "var(--mono)" }}>{session.user.id}</div>
        </div>
        <button className="button secondary" onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="card stack">
      <h3>Email Authentication</h3>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="button secondary"
          onClick={() => setMode("signin")}
          disabled={mode === "signin"}
        >
          Sign in
        </button>
        <button
          className="button secondary"
          onClick={() => setMode("signup")}
          disabled={mode === "signup"}
        >
          Sign up
        </button>
      </div>

      {mode === "signup" ? (
        <div className="form-row">
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      ) : null}

      <div className="form-row">
        <label>Email</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="form-row">
        <label>Password</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <button className="button" onClick={submit} disabled={pending || !email || !password}>
        {pending ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
      </button>

      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}
