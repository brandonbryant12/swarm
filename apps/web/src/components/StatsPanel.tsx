import { useEffect, useState } from "react";
import { authClient } from "../lib/auth-client";
import { orpc } from "../lib/orpc";

interface OverviewState {
  totalDocuments: number;
  totalScrapedItems: number;
  recentDocuments24h: number;
  recentScrapedItems24h: number;
  duplicateRateEstimate: number;
  topSubreddits: ReadonlyArray<{ subreddit: string; count: number }>;
}

export function StatsPanel() {
  const { data: session } = authClient.useSession();
  const [data, setData] = useState<OverviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session?.user) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void orpc.stats.overview()
      .then((response: any) => {
        if (!cancelled) {
          setData(response as OverviewState);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  return (
    <div className="card stack">
      <h3>Postgres Stats</h3>
      {!session?.user ? <div>Sign in to view protected stats.</div> : null}
      {loading ? <div>Loading...</div> : null}
      {error ? <div className="error">{error}</div> : null}

      {data ? (
        <>
          <div className="kv">
            <div className="k">Total documents</div>
            <div>{data.totalDocuments}</div>
            <div className="k">Total scraped items</div>
            <div>{data.totalScrapedItems}</div>
            <div className="k">Recent documents (24h)</div>
            <div>{data.recentDocuments24h}</div>
            <div className="k">Recent scraped items (24h)</div>
            <div>{data.recentScrapedItems24h}</div>
            <div className="k">Duplicate estimate</div>
            <div>{(data.duplicateRateEstimate * 100).toFixed(2)}%</div>
          </div>

          <h4 style={{ marginBottom: 8 }}>Top Subreddits</h4>
          <div className="stack">
            {data.topSubreddits.map((row) => (
              <div key={row.subreddit} className="kv" style={{ fontFamily: "var(--mono)" }}>
                <div className="k">r/{row.subreddit}</div>
                <div>{row.count}</div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
