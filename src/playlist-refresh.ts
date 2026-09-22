import type { Playlist, Rule } from "./model";

function usesFavorite(rule?: Rule): boolean {
  if (!rule) return false;
  if (rule.mode) return (rule.rules || []).some(usesFavorite);
  return rule.field === "favorite";
}

const signature = (p: Playlist) => JSON.stringify([p.rule, p.sort, p.desc]);

export interface RefreshPlan {
  ids: string[];
  definitions: Map<string, string>;
  libraryRevision: number;
  favoriteRevision: number;
}

// Only successful requests acknowledge invalidations. An aborted initial/full
// refresh must remain full even if the next event is only a favorite change.
export class PlaylistRefresh {
  private definitions = new Map<string, string>();
  private libraryRevision = -1;
  private favoriteRevision = -1;

  plan(
    playlists: Playlist[],
    libraryRevision: number,
    favoriteRevision: number,
  ): RefreshPlan {
    const smart = playlists.filter((p) => p.smart);
    return {
      ids: smart
        .filter(
          (p) =>
            libraryRevision !== this.libraryRevision ||
            signature(p) !== this.definitions.get(p.id) ||
            (favoriteRevision !== this.favoriteRevision &&
              (p.sort === "favorite" || usesFavorite(p.rule))),
        )
        .map((p) => p.id),
      definitions: new Map(smart.map((p) => [p.id, signature(p)])),
      libraryRevision,
      favoriteRevision,
    };
  }

  commit(plan: RefreshPlan) {
    this.definitions = plan.definitions;
    this.libraryRevision = plan.libraryRevision;
    this.favoriteRevision = plan.favoriteRevision;
  }
}
