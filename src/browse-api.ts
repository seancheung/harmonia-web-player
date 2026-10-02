import { api, type Playlist, type Rule, type Track } from "./model";
import { player } from "./player";
export interface BrowseQuery {
  section: string;
  detail?: string;
  preset?: string;
  search?: string;
  rule?: Rule;
  sort?: string;
  desc?: boolean;
  page?: number;
  pageSize?: number;
  albums?: boolean;
  disc?: number;
  recursive?: boolean;
  start?: string;
}
export interface BrowseGroup {
  id: string;
  name: string;
  artist: string;
  year: number;
  count: number;
  albumCount: number;
  playCount: number;
  addedAt: number;
  modifiedAt: number;
  createdAt: number;
  smart: boolean;
  tracks: Track[];
}
export interface BrowsePage {
  items: Track[];
  groups: BrowseGroup[];
  folders: string[];
  total: number;
  trackCount: number;
  libraryCount: number;
  heading: string;
  artist: string;
  year: number;
  cover?: Track;
  discs: number[];
  playlist?: Playlist;
  folderExists: boolean;
}
export interface HomePageData {
  recent: Track[];
  frequent: Track[];
  unheard: Track[];
  artists: BrowseGroup[];
  total: number;
}
export const browsePath = (query: BrowseQuery) =>
  `/browse?query=${encodeURIComponent(JSON.stringify(query))}`;
export async function playBrowse(
  query: BrowseQuery,
  mode: "album" | "track" = "track",
) {
  const { ids } = await api<{ ids: string[] }>(
    `/queue/query?query=${encodeURIComponent(JSON.stringify(query))}`,
  );
  const { items } = await api<{ items: Track[] }>("/tracks/resolve", "POST", {
    ids,
  });
  player.replace(
    items.filter((track) => !track.missing),
    0,
    mode,
  );
}
