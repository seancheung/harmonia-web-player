import { startTransition, useEffect, useRef, useState } from "react";
import { api, type Playlist } from "./model";

// Saves finish independently of database matching. Cancel obsolete refreshes.
export function useSmartPlaylists(
  playlists: Playlist[],
  serverRevision: number,
) {
  const version = useRef(0);
  const [smartPlaylists, setMemberships] = useState<Record<string, string[]>>(
    {},
  );
  const [playlistsRefreshing, setRefreshing] = useState(false);
  const [playlistError, setError] = useState("");
  useEffect(() => {
    const revision = ++version.current;
    const controller = new AbortController();
    setError("");
    if (!playlists.some((playlist) => playlist.smart)) {
      setMemberships({});
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    void api<{ memberships: Record<string, string[]> }>(
      "/playlists/memberships",
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted || revision !== version.current) return;
        startTransition(() => {
          setMemberships(result.memberships);
          setRefreshing(false);
        });
      })
      .catch(() => {
        if (controller.signal.aborted || revision !== version.current) return;
        setError("playlistRefreshFailed");
        setRefreshing(false);
      });
    return () => controller.abort();
  }, [playlists, serverRevision]);
  return { smartPlaylists, playlistsRefreshing, playlistError };
}
