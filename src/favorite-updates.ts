import type { Track } from "./model";

type Change = {
  confirmed: boolean;
  value: boolean;
  version: number;
  pending: number;
  tail: Promise<void>;
};

// Apply immediately, serialize per track, and roll back only the latest intent.
export class FavoriteUpdates {
  version = 0;
  private changes = new Map<string, Change>();
  constructor(
    private send: (
      id: string,
      favorite: boolean,
    ) => Promise<{ favorite: boolean }>,
    private apply: (id: string, favorite: boolean) => void,
  ) {}
  set(id: string, value: boolean, initial: boolean): Promise<void> {
    let change = this.changes.get(id);
    if (!change) {
      change = {
        confirmed: initial,
        value: initial,
        version: 0,
        pending: 0,
        tail: Promise.resolve(),
      };
      this.changes.set(id, change);
    }
    const current = change;
    const version = ++this.version;
    current.version = version;
    current.value = value;
    current.pending++;
    this.apply(id, value);
    const request = current.tail.then(async () => {
      try {
        const result = await this.send(id, value);
        current.confirmed = result.favorite;
        if (current.version === version) {
          current.value = result.favorite;
          current.version = ++this.version;
          if (current.value !== value) this.apply(id, current.value);
        }
      } catch (error) {
        if (current.version === version) {
          current.value = current.confirmed;
          current.version = ++this.version;
          this.apply(id, current.value);
          throw error;
        }
      } finally {
        current.pending--;
      }
    });
    current.tail = request.catch(() => {});
    return request;
  }
  merge(tracks: Track[], since: number): Track[] {
    return tracks.map((track) => {
      const change = this.changes.get(track.id);
      if (!change) return track;
      if (change.pending > 0 || change.version > since)
        return { ...track, favorite: change.value };
      change.confirmed = track.favorite;
      change.value = track.favorite;
      return track;
    });
  }
}
