import { startTransition, useEffect, useRef, useState } from "react";
import { api, type Playlist } from "./model";
import { PlaylistRefresh } from "./playlist-refresh";

// Saves finish independently of database matching. Cancel obsolete refreshes.
export function useSmartPlaylists(
  playlists: Playlist[],
  serverRevision: number,
  favoriteRevision: number,
) {
  const version = useRef(0);
  const scheduler = useRef(new PlaylistRefresh());
  const [smartPlaylists, setMemberships] = useState<Record<string, string[]>>(
    {},
  );
  const [playlistsRefreshing, setRefreshing] = useState(false);
  const [playlistError, setError] = useState("");
  useEffect(() => {
    const revision = ++version.current;
    const controller = new AbortController();
    setError("");
    const plan = scheduler.current.plan(
      playlists,
      serverRevision,
      favoriteRevision,
    );
    const retain = (current: Record<string, string[]>) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => plan.definitions.has(id)),
      );
    if (!plan.ids.length) {
      scheduler.current.commit(plan);
      setMemberships(retain);
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    const query = new URLSearchParams();
    for (const id of plan.ids) query.append("id", id);
    void api<{ memberships: Record<string, string[]> }>(
      `/playlists/memberships?${query}`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted || revision !== version.current) return;
        scheduler.current.commit(plan);
        startTransition(() => {
          setMemberships((current) => ({
            ...retain(current),
            ...result.memberships,
          }));
          setRefreshing(false);
        });
      })
      .catch(() => {
        if (controller.signal.aborted || revision !== version.current) return;
        setError("playlistRefreshFailed");
        setRefreshing(false);
      });
    return () => controller.abort();
  }, [playlists, serverRevision, favoriteRevision]);
  return { smartPlaylists, playlistsRefreshing, playlistError };
}
