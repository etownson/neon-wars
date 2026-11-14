// Online leaderboard built on Supabase PostgREST (the REST API Supabase
// exposes over your Postgres tables). We talk to it with plain fetch() so the
// static GitHub Pages build needs no server and no extra npm dependency.
//
// The feature is fully self-disabling: if supabaseConfig.ts is empty, the
// functions below report that the leaderboard is off and the UI hides it.
import { supabaseUrl, supabaseAnonKey } from "./supabaseConfig";

export interface LeaderboardEntry {
  initials: string;
  score: number;
  wave: number;
  created_at: string;
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: string };

const enabled = supabaseUrl !== "" && supabaseAnonKey !== "";

/** Whether online leaderboard is configured (config values filled in). */
export function leaderboardEnabled(): boolean {
  return enabled;
}

/** POST one score to the leaderboard. */
export async function submitScore(
  initials: string,
  score: number,
  wave: number
): Promise<SubmitResult> {
  if (!enabled) return { ok: false, error: "Leaderboard not configured" };
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/scores`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ initials, score, wave }),
    });
    if (!res.ok) return { ok: false, error: `Submit failed (${res.status})` };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

/** Fetch the top scores, newest-limit first, filtered to our own columns. */
export async function fetchTopScores(limit = 10): Promise<LeaderboardEntry[]> {
  if (!enabled) return [];
  try {
    const params = new URLSearchParams({
      select: "initials,score,wave,created_at",
      order: "score.desc,created_at.asc", // ties resolve to earliest first
      limit: String(limit),
    });
    const res = await fetch(`${supabaseUrl}/rest/v1/scores?${params}`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });
    if (!res.ok) return [];
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .filter((r) => typeof r.initials === "string" && typeof r.score === "number")
      .map((r) => ({
        initials: String(r.initials).slice(0, 3),
        score: Number(r.score),
        wave: typeof r.wave === "number" ? r.wave : 0,
        created_at: typeof r.created_at === "string" ? r.created_at : "",
      }));
  } catch {
    return [];
  }
}
