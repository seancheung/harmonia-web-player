import { api, type Library, type Track } from "./model";

export interface LibraryChanges {
  syncCursor: string;
  reset: boolean;
  tracks: Track[];
  removed: string[];
  metadata?: Omit<Library, "tracks" | "syncCursor">;
}

export function mergeLibraryChanges(
  current: Library,
  changes: LibraryChanges,
): Library {
  if (changes.tracks.length === 0 && changes.removed.length === 0) {
    return {
      ...current,
      ...changes.metadata,
      tracks: current.tracks,
      syncCursor: changes.syncCursor,
    };
  }
  const removed = new Set(changes.removed);
  const updated = new Map(changes.tracks.map((track) => [track.id, track]));
  const tracks = current.tracks
    .filter((track) => !removed.has(track.id))
    .map((track) => {
      const replacement = updated.get(track.id);
      updated.delete(track.id);
      return replacement ?? track;
    });
  tracks.push(...updated.values());
  return {
    ...current,
    ...changes.metadata,
    tracks,
    syncCursor: changes.syncCursor,
  };
}

export async function syncLibrary(current: Library): Promise<Library> {
  if (!current.syncCursor) return api<Library>("/library");
  const changes = await api<LibraryChanges>(
    `/library/changes?since=${encodeURIComponent(current.syncCursor)}`,
  );
  if (changes.reset) return api<Library>("/library");
  if (changes.syncCursor === current.syncCursor) return current;
  return mergeLibraryChanges(current, changes);
}
