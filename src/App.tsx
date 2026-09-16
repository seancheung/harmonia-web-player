import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  redirect,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import {
  ArrowDownWideNarrow,
  ArrowLeftToLine,
  ArrowRightFromLine,
  ArrowUpNarrowWide,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Disc3,
  Folder,
  Grid2X2,
  Heart,
  History,
  House,
  Info,
  List,
  ListMusic,
  Mic2,
  Music2,
  Play,
  Plus,
  Search,
  Settings2,
  Shapes,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Cover,
  emptyRule,
  FavoriteButton,
  FolderArtwork,
  GenreCover,
  IconButton,
  Menu,
  Modal,
  RuleEditor,
  validateRule,
} from "./components";
import { AppProvider, useApp } from "./context";
import { DialogPresence } from "./dialog-presence";
import { HomePage } from "./home";
import type { TextKey } from "./i18n";
import {
  api,
  duration,
  load,
  matches,
  type Playlist,
  type Rule,
  save,
  sortTracks,
  splitMembers as splitTagMembers,
  type Track,
} from "./model";
import { player } from "./player";
import { PlayerBar } from "./player-ui";
import { Select, SelectOption } from "./select";
import { SettingsPage } from "./settings";
import { type SongColumn, songColumns, songColumnValue } from "./song-columns";
import { ThemeToggle } from "./theme-toggle";
import { TrackDetails } from "./track-details";
import "./styles.css";

const sections = [
  { id: "home", icon: House },
  { id: "albums", icon: Disc3 },
  { id: "songs", icon: Music2 },
  { id: "artists", icon: Mic2 },
  { id: "genres", icon: Shapes },
  { id: "folders", icon: Folder },
  { id: "favorites", icon: Heart },
  { id: "recent", icon: History },
  { id: "playlists", icon: ListMusic },
] as const;
function Shell() {
  const { t } = useApp();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let compactHeader = false;
    const updateHeader = () => {
      const next = compactHeader ? window.scrollY > 8 : window.scrollY > 64;
      if (mainRef.current) mainRef.current.dataset.scrolled = String(next);
      compactHeader = next;
    };
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);
  const [collapsed, setCollapsed] = useState(() =>
    load("sidebarCollapsed", false),
  );
  const reducedMotion = useReducedMotion();
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 1150px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1150px)");
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const transition = {
    duration: reducedMotion ? 0 : 0.22,
    ease: [0.22, 1, 0.36, 1] as const,
  };
  return (
    <motion.div
      initial={false}
      animate={{
        "--sidebar-width": `${collapsed ? 76 : compact ? 195 : 228}px`,
        "--sidebar-label-opacity": collapsed ? 0 : 1,
      }}
      transition={transition}
      className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}
    >
      <aside className="sidebar">
        <div className="brand">
          <Link
            to="/$section"
            params={{ section: "home" }}
            style={{ display: "flex", alignItems: "center" }}
          >
            <span className="brand-icon">
              <span className="brand-mark" aria-hidden="true" />
            </span>
            <span className="brand-name">
              harmonia<span className="brand-dot">.</span>
            </span>
          </Link>
        </div>
        <nav>
          {sections.map(({ id, icon: Icon }) => (
            <Link
              key={id}
              aria-label={t(id)}
              title={t(id)}
              to="/$section"
              params={{ section: id }}
              activeProps={{ className: "nav-active" }}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{t(id)}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={t(collapsed ? "expandSidebar" : "collapseSidebar")}
            title={t(collapsed ? "expandSidebar" : "collapseSidebar")}
            aria-expanded={!collapsed}
            onClick={() => {
              setCollapsed(!collapsed);
              save("sidebarCollapsed", !collapsed);
            }}
          >
            {collapsed ? (
              <ArrowRightFromLine size={19} />
            ) : (
              <ArrowLeftToLine size={19} />
            )}
            <span>{t("collapse")}</span>
          </button>
          <Link
            aria-label={t("settings")}
            title={t("settings")}
            to="/$section"
            params={{ section: "settings" }}
            activeProps={{ className: "nav-active" }}
          >
            <Settings2 size={19} />
            <span>{t("settings")}</span>
          </Link>
        </div>
      </aside>
      <main ref={mainRef} className="main">
        <Outlet />
      </main>
      <PlayerBar />
    </motion.div>
  );
}
function CreatePlaylistMenu({ expanded = false }: { expanded?: boolean }) {
  const { t } = useApp();
  const [kind, setKind] = useState<"regular" | "smart">();
  return (
    <>
      <Menu
        label={t("newPlaylist")}
        className={expanded ? "primary" : "icon-button"}
        trigger={
          <>
            <Plus size={17} />
            {expanded && t("newPlaylist")}
          </>
        }
        items={[
          {
            label: t("addPlaylist"),
            icon: <ListMusic size={16} />,
            onSelect: () => setKind("regular"),
          },
          {
            label: t("addSmartPlaylist"),
            icon: <SlidersHorizontal size={16} />,
            onSelect: () => setKind("smart"),
          },
        ]}
      />
      <DialogPresence>
        {kind && (
          <PlaylistDialog
            rule={kind === "smart" ? emptyRule() : undefined}
            close={() => setKind(undefined)}
          />
        )}
      </DialogPresence>
    </>
  );
}
function PlaylistDialog({
  close,
  rule,
  existing,
  sort = "addedAt",
  desc = true,
}: {
  close: () => void;
  rule?: Rule;
  existing?: Playlist;
  sort?: string;
  desc?: boolean;
}) {
  const { t, run, notice } = useApp();
  const [name, setName] = useState(existing?.name || "");
  const [smartRule, setSmartRule] = useState(rule || existing?.rule);
  const [field, setField] = useState(existing?.sort || sort);
  const [direction, setDirection] = useState(existing?.desc ?? desc);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  return (
    <Modal
      title={existing ? t("edit") : rule ? t("saveSmart") : t("newPlaylist")}
      close={() => {
        if (!savingRef.current) close();
      }}
    >
      <form
        aria-busy={saving}
        onSubmit={async (e) => {
          e.preventDefault();
          if (savingRef.current) return;
          if (smartRule && !validateRule(smartRule)) {
            notice(t("ruleInvalid"));
            return;
          }
          savingRef.current = true;
          setSaving(true);
          try {
            if (
              await run(() =>
                api(
                  `/playlists${existing ? `/${existing.id}` : ""}`,
                  existing ? "PUT" : "POST",
                  {
                    name,
                    smart: !!smartRule,
                    rule: smartRule,
                    sort: field,
                    desc: direction,
                  },
                ),
              )
            ) {
              notice(t("saved"));
              close();
            }
          } finally {
            savingRef.current = false;
            setSaving(false);
          }
        }}
      >
        <fieldset disabled={saving} style={{ display: "contents" }}>
          <label>
            {t("name")}
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {smartRule && (
            <>
              <RuleEditor rule={smartRule} onChange={setSmartRule} />
              <SortControl
                field={field}
                desc={direction}
                fields={songSort}
                onChange={(s, d) => {
                  setField(s);
                  setDirection(d);
                }}
              />
            </>
          )}
          <footer>
            <button type="button" className="secondary" onClick={close}>
              {t("cancel")}
            </button>
            <button className="primary" type="submit">
              {t(saving ? "saving" : "save")}
            </button>
          </footer>
        </fieldset>
      </form>
      {saving && (
        <p className="help" role="status">
          {t("playlistSaving")}
        </p>
      )}
    </Modal>
  );
}
const songSort = [
  "addedAt",
  "title",
  "artist",
  "album",
  "year",
  "duration",
  "playCount",
  "disc",
  "number",
];
function SortControl({
  field,
  desc,
  fields,
  titleLabel = "title",
  onChange,
}: {
  field: string;
  desc: boolean;
  fields: string[];
  titleLabel?: TextKey;
  onChange: (f: string, d: boolean) => void;
}) {
  const { t } = useApp();
  return (
    <div className="sort-control">
      <Select
        aria-label={t("sort")}
        value={field}
        onChange={(e) => onChange(e.target.value, desc)}
      >
        {fields.map((f) => (
          <SelectOption key={f} value={f}>
            {t(f === "title" ? titleLabel : (f as TextKey)) || f}
          </SelectOption>
        ))}
      </Select>
      <IconButton
        label={t(desc ? "desc" : "asc")}
        onClick={() => onChange(field, !desc)}
      >
        {desc ? (
          <ArrowDownWideNarrow size={16} />
        ) : (
          <ArrowUpNarrowWide size={16} />
        )}
      </IconButton>
    </div>
  );
}
interface ViewPrefs {
  grid: boolean;
  sort: string;
  desc: boolean;
  size: number;
}
interface Group {
  playCount?: number;
  modifiedAt?: number;
  createdAt?: number;
  id: string;
  name: string;
  subtitle: string;
  tracks: Track[];
  year: number;
  addedAt: number;
  count: number;
  albumCount: number;
  artist: string;
}
function BrowsePage() {
  const { preset } = useSearch({ strict: false });
  const params = useParams({ strict: false }) as {
    section?: string;
    detail?: string;
  };
  const section = params.section || "home";
  if (section === "home") return <HomePage />;
  if (section === "settings") return <SettingsPage />;
  return (
    <Browse
      key={`${section}-${preset || ""}`}
      section={section}
      detail={params.detail}
      preset={
        !params.detail &&
        (section === "songs" ||
          (section === "artists" && preset === "topArtists"))
          ? preset
          : undefined
      }
    />
  );
}
function Browse({
  section,
  detail,
  preset,
}: {
  section: string;
  detail?: string;
  preset?: string;
}) {
  const { t, lib, prefs, error, busy, reload, run, notice } = useApp();
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [extraColumns, setExtraColumns] = useState<SongColumn[]>(() => {
    const stored = load<unknown>("songColumns", []);
    return songColumns
      .filter((column) => Array.isArray(stored) && stored.includes(column.id))
      .map((column) => column.id);
  });
  const changeColumns = (columns: SongColumn[]) => {
    setExtraColumns(columns);
    save("songColumns", columns);
  };
  const splitMembers = (text: string) =>
    splitTagMembers(text, lib.tagSeparators || "");
  const [view, setView] = useState<ViewPrefs>(() => ({
    ...load<ViewPrefs>(`view.${section}`, {
      grid: ["albums", "artists"].includes(section),
      sort:
        section === "folders"
          ? "filename"
          : section === "albums" || section === "artists"
            ? "title"
            : "addedAt",
      desc: !["albums", "artists", "folders"].includes(section),
      size: 50,
    }),
    ...(preset
      ? {
          sort:
            preset === "topSongs" || preset === "topArtists"
              ? "playCount"
              : "addedAt",
          desc: true,
        }
      : {}),
  }));
  const [page, setPage] = useState(1);
  const [search, setAppliedSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const composing = useRef(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const cancelSearch = () => clearTimeout(searchTimer.current);
  const scheduleSearch = (value: string) => {
    cancelSearch();
    searchTimer.current = setTimeout(() => setAppliedSearch(value), 300);
  };
  const setSearch = (value: string) => {
    cancelSearch();
    setSearchInput(value);
    setAppliedSearch(value);
  };
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  const [filterOpen, setFilterOpen] = useState(false);
  const [rule, setRule] = useState<Rule | undefined>(() =>
    preset === "topSongs" || preset === "topArtists" || preset === "unheard"
      ? {
          mode: "all",
          rules: [
            {
              field: "playCount",
              op: preset === "unheard" ? "eq" : "gt",
              value: 0,
            },
          ],
        }
      : undefined,
  );
  const [draft, setDraft] = useState<Rule>(emptyRule);
  const [smart, setSmart] = useState(false);
  const [newPlaylist, setNewPlaylist] = useState(false);
  const [editing, setEditing] = useState<Playlist>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Track[]>();
  const [details, setDetails] = useState<Track>();
  const [detailAlbums, setDetailAlbums] = useState(
    section === "artists" || section === "genres",
  );
  const [selectedDisc, setSelectedDisc] = useState<number | null>(null);
  useEffect(() => setSelectedDisc(null), [detail]);
  const playback = useSyncExternalStore(player.subscribe, player.snapshot);
  const playlist = lib.playlists.find((p) => p.id === detail);
  const updateView = (patch: Partial<ViewPrefs>) => {
    setView((v) => {
      const next = { ...v, ...patch };
      save(`view.${section}`, next);
      return next;
    });
    if (
      patch.sort !== undefined ||
      patch.desc !== undefined ||
      patch.size !== undefined
    )
      setPage(1);
  };
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [detail, search, rule]);
  const all = lib.tracks.filter((t) => !t.missing);
  let tracks = all;
  let heading = t(section as TextKey) || section;
  let subheading = "";
  let sourceID = "",
    folder = "";
  if (section === "favorites") tracks = tracks.filter((t) => t.favorite);
  if (section === "recent") {
    tracks = tracks.filter((t) => t.lastPlayed);
  }
  if (detail && section === "albums") {
    tracks = tracks.filter((t) => t.albumId === detail);
    heading = tracks[0]?.album || t("unknownAlbum");
    subheading =
      tracks[0]?.albumArtist || tracks[0]?.artist || t("unknownArtist");
    subheading += ` · ${tracks[0]?.year || t("unknownYear")}`;
  }
  if (detail && section === "artists") {
    tracks = tracks.filter(
      (t) =>
        (detail === "__unknown__" &&
          !t.artist.trim() &&
          !t.albumArtist.trim()) ||
        splitMembers(t.artist).some(
          (a) => a.toLowerCase() === detail.toLowerCase(),
        ) ||
        splitMembers(t.albumArtist).some(
          (a) => a.toLowerCase() === detail.toLowerCase(),
        ),
    );
    heading = detail === "__unknown__" ? t("unknownArtist") : detail;
  }
  if (detail && section === "genres") {
    tracks = tracks.filter((t) =>
      detail === "__unknown__"
        ? !t.genre.trim()
        : splitMembers(t.genre).some(
            (g) => g.toLowerCase() === detail.toLowerCase(),
          ),
    );
    heading = detail === "__unknown__" ? t("unknownGenre") : detail;
  }
  if (section === "folders" && detail) {
    const parts = detail.split("|");
    sourceID = parts[0];
    folder = parts.slice(1).join("|");
    const source = lib.sources.find((s) => s.id === sourceID);
    heading = folder.split("/").pop() || source?.name || t("folders");
    subheading = source?.error || "";
    tracks = tracks.filter(
      (t) => t.sourceId === sourceID && t.folder === folder,
    );
  }
  if (section === "playlists" && detail) {
    heading = playlist?.name || t("missing");
    if (playlist?.smart) {
      tracks = tracks.filter((t) => playlist.rule && matches(t, playlist.rule));
    } else {
      const byID = new Map(lib.tracks.map((t) => [t.id, t]));
      tracks = (playlist?.tracks || []).flatMap((id) => {
        const track = byID.get(id);
        return track ? [track] : [];
      });
    }
  }
  const isAlbumDetail = section === "albums" && !!detail;
  const albumDiscs = isAlbumDetail
    ? [...new Set(tracks.map((track) => track.disc || 1))].sort((a, b) => a - b)
    : [];
  const activeDisc =
    albumDiscs.length > 1 &&
    selectedDisc !== null &&
    albumDiscs.includes(selectedDisc)
      ? selectedDisc
      : null;
  if (activeDisc !== null)
    tracks = tracks.filter((track) => (track.disc || 1) === activeDisc);
  const showDiscNumber = albumDiscs.length > 1 && activeDisc === null;
  const searchText = search.toLowerCase();
  tracks = tracks.filter(
    (t) =>
      !search ||
      [t.title, t.artist, t.album, t.genre]
        .join(" ")
        .toLowerCase()
        .includes(searchText),
  );
  if (rule) tracks = tracks.filter((t) => matches(t, rule));
  const manual = section === "playlists" && !!detail && !playlist?.smart;
  const supportsAlbumView = !!detail && ["artists", "genres"].includes(section);
  const groupMode =
    (!detail &&
      ["albums", "artists", "genres", "playlists", "folders"].includes(
        section,
      )) ||
    (supportsAlbumView && detailAlbums);
  const groupType = detailAlbums && supportsAlbumView ? "albums" : section;
  const sortFields =
    section === "folders"
      ? ["filename", "modifiedAt", "createdAt"]
      : groupMode
        ? groupType === "albums"
          ? ["title", "artist", "year", "addedAt", "count"]
          : groupType === "artists"
            ? ["title", "count", "albumCount", "playCount"]
            : ["title", "count", "albumCount"]
        : songSort;
  const viewSort = sortFields.includes(view.sort) ? view.sort : sortFields[0];
  const sort = playlist?.smart
    ? playlist.sort
    : section === "recent"
      ? "lastPlayed"
      : section === "albums" && detail && viewSort === "title"
        ? "disc"
        : viewSort;
  const desc = playlist?.smart
    ? playlist.desc
    : section === "recent"
      ? true
      : view.desc;
  if (!manual) tracks = sortTracks(tracks, sort, desc);
  const playAllTracks =
    section === "folders" && detail
      ? sortTracks(
          all.filter(
            (track) =>
              track.sourceId === sourceID &&
              (!folder ||
                track.folder === folder ||
                track.folder.startsWith(`${folder}/`)) &&
              (!search ||
                [track.title, track.artist, track.album, track.genre]
                  .join(" ")
                  .toLowerCase()
                  .includes(searchText)) &&
              (!rule || matches(track, rule)),
          ),
          sort,
          desc,
        )
      : tracks;
  const groups: Group[] = [];
  if (groupMode && ["albums", "artists", "genres"].includes(groupType)) {
    const map = new Map<string, Track[]>();
    for (const track of tracks) {
      const keys =
        groupType === "albums"
          ? [track.albumId]
          : groupType === "artists"
            ? [
                ...new Set([
                  ...splitMembers(track.artist),
                  ...(preset === "topArtists"
                    ? []
                    : splitMembers(track.albumArtist)),
                ]),
              ]
            : splitMembers(track.genre);
      if (!keys.length) keys.push("__unknown__");
      for (const key of keys) {
        const normalized = groupType === "albums" ? key : key.toLowerCase();
        const found = map.get(normalized) || [];
        found.push(track);
        map.set(normalized, found);
      }
    }
    for (const [id, items] of map) {
      const first = items[0];
      const name =
        groupType === "albums"
          ? first.album || t("unknownAlbum")
          : groupType === "artists"
            ? [
                ...splitMembers(first.artist),
                ...splitMembers(first.albumArtist),
              ].find((a) => a.toLowerCase() === id) || t("unknownArtist")
            : splitMembers(first.genre).find((g) => g.toLowerCase() === id) ||
              t("unknownGenre");
      groups.push({
        playCount: items.reduce((total, track) => total + track.playCount, 0),
        id: groupType === "albums" || id === "__unknown__" ? id : name,
        name,
        subtitle:
          groupType === "albums"
            ? first.albumArtist || first.artist || t("unknownArtist")
            : `${items.length} ${t("songs")}`,
        tracks: sortTracks(items, "addedAt", false),
        year: first.year,
        addedAt: Math.min(...items.map((t) => t.addedAt)),
        count: items.length,
        albumCount: new Set(items.map((t) => t.albumId)).size,
        artist: first.albumArtist || first.artist,
      });
    }
  } else if (groupMode && section === "playlists") {
    for (const p of lib.playlists.filter((p) =>
      p.name.toLowerCase().includes(searchText),
    )) {
      const ts = p.smart
        ? all.filter((t) => p.rule && matches(t, p.rule))
        : p.tracks.flatMap((id) => {
            const track = lib.tracks.find((t) => t.id === id);
            return track ? [track] : [];
          });
      groups.push({
        id: p.id,
        name: p.name,
        subtitle: `${ts.length} ${t("songs")}${p.smart ? ` · ${t("smart")}` : ""}`,
        tracks: ts,
        year: 0,
        addedAt: 0,
        count: ts.length,
        albumCount: 0,
        artist: "",
      });
    }
  } else if (groupMode && section === "folders") {
    for (const s of lib.sources) {
      groups.push({
        id: `${s.id}|`,
        modifiedAt: s.folderTimes?.[""]?.modifiedAt,
        createdAt: s.folderTimes?.[""]?.createdAt,
        name: s.name,
        subtitle: s.error || "",
        tracks: all.filter((t) => t.sourceId === s.id),
        year: 0,
        addedAt: 0,
        count: 0,
        albumCount: 0,
        artist: "",
      });
    }
  }
  if (groupMode)
    groups.sort((a, b) => {
      const field = ["title", "filename"].includes(viewSort)
        ? "name"
        : viewSort;
      const av = a[field as keyof Group],
        bv = b[field as keyof Group];
      const am = av === "" || av === 0 || av === undefined,
        bm = bv === "" || bv === 0 || bv === undefined;
      if (am !== bm) return am ? 1 : -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return (
        (view.desc ? -cmp : cmp) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id)
      );
    });
  const childFolders =
    section === "folders" && detail
      ? [
          ...new Set(
            all
              .filter(
                (t) =>
                  t.sourceId === sourceID &&
                  (folder === "" || t.folder.startsWith(`${folder}/`)),
              )
              .map((t) => {
                const suffix = folder
                  ? t.folder.slice(folder.length + 1)
                  : t.folder;
                return suffix.split("/")[0];
              })
              .filter(Boolean),
          ),
        ].sort((a, b) => {
          if (viewSort === "modifiedAt" || viewSort === "createdAt") {
            const times = lib.sources.find(
              (s) => s.id === sourceID,
            )?.folderTimes;
            const av = times?.[folder ? `${folder}/${a}` : a]?.[viewSort] || 0;
            const bv = times?.[folder ? `${folder}/${b}` : b]?.[viewSort] || 0;
            if (!!av !== !!bv) return av ? -1 : 1;
            if (av !== bv) return (av - bv) * (view.desc ? -1 : 1);
          }
          return a.localeCompare(b) * (view.desc ? -1 : 1);
        })
      : [];
  const folderExists =
    !folder ||
    all.some(
      (t) =>
        t.sourceId === sourceID &&
        (t.folder === folder || t.folder.startsWith(`${folder}/`)),
    );
  const total = groupMode ? groups.length : tracks.length + childFolders.length;
  const maxPage = Math.max(1, Math.ceil(total / view.size));
  const currentPage = Math.min(page, maxPage);
  const start = (currentPage - 1) * view.size;
  const pageGroups = groups.slice(start, start + view.size);
  const pageFolders = childFolders.slice(start, start + view.size);
  const pageTracks = tracks.slice(
    Math.max(0, start - childFolders.length),
    Math.max(0, start + view.size - childFolders.length),
  );
  const selectedTracks = tracks.filter((t) => selected.has(t.id));
  const link = (sec: string, id?: string) =>
    id
      ? {
          to: "/$section/$detail" as const,
          params: { section: sec, detail: id },
        }
      : { to: "/$section" as const, params: { section: sec } };
  async function favorite(track: Track) {
    await run(() =>
      api(`/tracks/${track.id}/favorite`, "PUT", { favorite: !track.favorite }),
    );
  }
  const menu = (track: Track) => (
    <Menu>
      {(close) => (
        <>
          <button
            type="button"
            disabled={track.missing}
            onClick={() => {
              player.add([track], true);
              close();
            }}
          >
            {t("playNext")}
          </button>
          <button
            type="button"
            disabled={track.missing}
            onClick={() => {
              player.add([track]);
              close();
            }}
          >
            {t("addQueue")}
          </button>
          <button
            type="button"
            disabled={track.missing}
            onClick={() => {
              setAdding([track]);
              close();
            }}
          >
            {t("addToPlaylist")}
          </button>
          <button
            type="button"
            disabled={track.missing}
            onClick={() => {
              void favorite(track);
              close();
            }}
          >
            {track.favorite ? "✓ " : ""}
            {t("favorite")}
          </button>
          <button
            type="button"
            onClick={() => {
              setDetails(track);
              close();
            }}
          >
            {t("details")}
          </button>
          {manual && (
            <>
              <button
                type="button"
                onClick={() => {
                  const pos = prompt(
                    t("position"),
                    String((playlist?.tracks.indexOf(track.id) || 0) + 1),
                  );
                  if (pos)
                    void run(() =>
                      api(`/playlists/${detail}/items`, "POST", {
                        action: "move",
                        ids: [track.id],
                        position: Number(pos),
                      }),
                    );
                  close();
                }}
              >
                {t("move")}
              </button>
              <button
                type="button"
                onClick={() => {
                  void run(() =>
                    api(`/playlists/${detail}/items`, "POST", {
                      action: "remove",
                      ids: [track.id],
                    }),
                  );
                  close();
                }}
              >
                {t("remove")}
              </button>
            </>
          )}
        </>
      )}
    </Menu>
  );
  return (
    <>
      <div className="topbar">
        <nav className="breadcrumb" aria-label={t("breadcrumb")}>
          <Link {...link("home")}>Harmonia</Link>
          <ChevronRight size={14} aria-hidden="true" />
          {detail ? (
            <Link {...link(section)}>{t(section as TextKey)}</Link>
          ) : (
            <span aria-current="page">{t(section as TextKey)}</span>
          )}
          {detail &&
            (section === "folders" ? (
              ["", ...folder.split("/").filter(Boolean)].map(
                (part, index, parts) => (
                  <React.Fragment key={index}>
                    <ChevronRight size={14} aria-hidden="true" />
                    {index === parts.length - 1 ? (
                      <span aria-current="page">
                        {index === 0
                          ? lib.sources.find((source) => source.id === sourceID)
                              ?.name || heading
                          : part}
                      </span>
                    ) : (
                      <Link
                        {...link(
                          "folders",
                          `${sourceID}|${folder.split("/").slice(0, index).join("/")}`,
                        )}
                      >
                        {index === 0
                          ? lib.sources.find((source) => source.id === sourceID)
                              ?.name || heading
                          : part}
                      </Link>
                    )}
                  </React.Fragment>
                ),
              )
            ) : (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                <span aria-current="page">{heading}</span>
              </>
            ))}
        </nav>
        <ThemeToggle />
      </div>
      <div className="page-content">
        <header
          className={`page-heading ${detail && section === "albums" ? "album-heading" : ""}`}
        >
          {detail && section === "albums" && <Cover track={tracks[0]} />}
          <div>
            <h1>{heading}</h1>
            {subheading && <p>{subheading}</p>}
          </div>
          <div className="heading-actions">
            {section === "playlists" && !detail ? (
              <CreatePlaylistMenu expanded />
            ) : (
              playAllTracks.length > 0 && (
                <button
                  type="button"
                  className="primary"
                  onClick={() =>
                    player.replace(
                      playAllTracks,
                      0,
                      section === "albums" && detail ? "album" : "track",
                    )
                  }
                >
                  <Play size={15} fill="currentColor" />
                  {t("playAll")}
                </button>
              )
            )}
            {playlist && (
              <Menu>
                {(close) => (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(playlist);
                        close();
                      }}
                    >
                      {t("edit")}
                    </button>
                    {!playlist.smart && (
                      <button
                        type="button"
                        onClick={() => {
                          void run(() =>
                            api(`/playlists/${detail}/items`, "POST", {
                              action: "clean",
                              ids: [],
                            }),
                          );
                          close();
                        }}
                      >
                        {t("cleanMissing")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(t("deletePlaylistHint")))
                          void run(() => api(`/playlists/${detail}`, "DELETE"));
                        close();
                      }}
                    >
                      {t("delete")}
                    </button>
                  </>
                )}
              </Menu>
            )}
            {section === "recent" && (
              <IconButton
                label={t("clearRecent")}
                onClick={() => {
                  if (confirm(t("recentHint")))
                    void run(() => api("/recent", "DELETE"));
                }}
              >
                <X size={18} />
              </IconButton>
            )}
          </div>
        </header>
        {error && (
          <div className="error-banner">
            <Info size={18} />
            <span>
              {t("offline")}: {t(error as TextKey) || error}
            </span>
            <button type="button" onClick={() => void reload()}>
              {t("retry")}
            </button>
            <Link {...link("settings")}>{t("settings")}</Link>
          </div>
        )}
        <div className={`toolbar ${selected.size ? "has-selection" : ""}`}>
          {selected.size > 0 && (
            <div className="selection-bar">
              <span className="result-count">
                {total} <span>{t("items")}</span>
              </span>
              <span>
                {selected.size} {t("selected")}
              </span>
              <button
                type="button"
                onClick={() =>
                  setSelected(
                    new Set(tracks.filter((t) => !t.missing).map((t) => t.id)),
                  )
                }
              >
                {t("allSelected")}
              </button>
              <button type="button" onClick={() => setAdding(selectedTracks)}>
                {t("addToPlaylist")}
              </button>
              <button type="button" onClick={() => player.add(selectedTracks)}>
                {t("addQueue")}
              </button>
              <IconButton
                label={t("clear")}
                onClick={() => setSelected(new Set())}
              >
                <X size={16} />
              </IconButton>
            </div>
          )}

          {albumDiscs.length > 1 && (
            <fieldset
              className="view-toggle disc-toggle"
              aria-label={t("disc")}
            >
              {[null, ...albumDiscs].map((disc) => (
                <button
                  key={disc ?? "all"}
                  type="button"
                  className={activeDisc === disc ? "active" : ""}
                  aria-pressed={activeDisc === disc}
                  onClick={() => {
                    setSelectedDisc(disc);
                    setPage(1);
                    setSelected(new Set());
                  }}
                >
                  {disc === null ? t("allDiscs") : `CD ${disc}`}
                </button>
              ))}
            </fieldset>
          )}
          {supportsAlbumView && (
            <div className="view-toggle">
              <IconButton
                label={t("albumView")}
                active={detailAlbums}
                onClick={() => {
                  setDetailAlbums(true);
                  setPage(1);
                }}
              >
                <Disc3 size={17} />
              </IconButton>
              <IconButton
                label={t("songView")}
                active={!detailAlbums}
                onClick={() => {
                  setDetailAlbums(false);
                  setPage(1);
                }}
              >
                <Music2 size={17} />
              </IconButton>
            </div>
          )}
          <span className="result-count">
            {total} <span>{t("items")}</span>
          </span>
          <div className="toolbar-spacer" />
          <div className="search-input">
            <Search size={17} />
            <input
              placeholder={t("search")}
              title={t("searchHint")}
              aria-label={t("search")}
              value={searchInput}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setSearchInput(value);
                if (!composing.current) scheduleSearch(value);
              }}
              onCompositionStart={() => {
                composing.current = true;
                cancelSearch();
              }}
              onCompositionEnd={(e) => {
                composing.current = false;
                setSearchInput(e.currentTarget.value);
                scheduleSearch(e.currentTarget.value);
              }}
            />
            {searchInput && (
              <IconButton label={t("clear")} onClick={() => setSearch("")}>
                <X size={14} />
              </IconButton>
            )}
          </div>
          {!manual && section !== "recent" && (
            <SortControl
              field={playlist?.smart ? playlist.sort : viewSort}
              desc={playlist?.smart ? playlist.desc : view.desc}
              fields={sortFields}
              titleLabel={groupMode ? "name" : "title"}
              onChange={(sort, desc) => {
                if (playlist?.smart) {
                  setPage(1);
                  void run(() =>
                    api(`/playlists/${playlist.id}`, "PUT", {
                      ...playlist,
                      sort,
                      desc,
                    }),
                  );
                } else updateView({ sort, desc });
              }}
            />
          )}
          <button
            type="button"
            className={`secondary filter-button ${rule ? "active" : ""}`}
            aria-label={t(rule ? "filterActive" : "filter")}
            aria-haspopup="dialog"
            aria-expanded={filterOpen}
            onClick={() => {
              setDraft(rule ? structuredClone(rule) : emptyRule());
              setFilterOpen(true);
            }}
          >
            <SlidersHorizontal size={15} />
            {t("filter")}
            {rule && <span className="smart-dot" />}
          </button>
          {!view.grid && !groupMode && (
            <IconButton
              label={t("songColumns")}
              active={extraColumns.length > 0}
              onClick={() => setColumnsOpen(true)}
            >
              <Columns3 size={17} />
            </IconButton>
          )}
          <div className="view-toggle">
            <IconButton
              label={t("grid")}
              active={view.grid}
              onClick={() => updateView({ grid: true })}
            >
              <Grid2X2 size={17} />
            </IconButton>
            <IconButton
              label={t("list")}
              active={!view.grid}
              onClick={() => updateView({ grid: false })}
            >
              <List size={18} />
            </IconButton>
          </div>
        </div>
        <DialogPresence>
          {filterOpen && (
            <Modal title={t("filter")} close={() => setFilterOpen(false)}>
              <RuleEditor rule={draft} onChange={setDraft} />
              <footer className="flex-wrap">
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    if (validateRule(draft)) {
                      setRule(draft);
                      setPage(1);
                      setFilterOpen(false);
                    } else notice(t("ruleInvalid"));
                  }}
                >
                  {t("filter")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setRule(undefined);
                    setDraft(emptyRule());
                    setPage(1);
                    setFilterOpen(false);
                  }}
                >
                  {t("clear")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (validateRule(draft)) {
                      setFilterOpen(false);
                      setSmart(true);
                    } else notice(t("ruleInvalid"));
                  }}
                >
                  {t("saveSmart")}
                </button>
              </footer>
            </Modal>
          )}
        </DialogPresence>
        {busy ? (
          <div className="empty-state">
            <div className="spinner" />
            <p role="status">{t("loadingLibrary")}</p>
          </div>
        ) : !folderExists ? (
          <div className="empty-state">
            <Folder size={42} />
            <h2>{t("folderGone")}</h2>
          </div>
        ) : total === 0 ? (
          <div className="empty-state">
            <div className="empty-art">
              <Disc3 size={70} strokeWidth={0.8} />
              <span>
                <Music2 size={22} />
              </span>
            </div>
            <h2>{t(all.length === 0 ? "empty" : "noResults")}</h2>
            <p>{t(all.length === 0 ? "emptyHint" : "noResultsHint")}</p>
            {all.length === 0 ? (
              <Link {...link("settings")} className="primary">
                {t("openSettings")}
                <ArrowUpRight size={16} />
              </Link>
            ) : (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setSearch("");
                  setRule(undefined);
                }}
              >
                {t("clear")}
              </button>
            )}
          </div>
        ) : groupMode ? (
          <div
            className={
              view.grid
                ? `album-grid ${groupType === "folders" ? "folder-grid" : groupType === "artists" ? "artist-grid" : groupType === "playlists" ? "playlist-grid" : ""}`
                : "group-list"
            }
          >
            {pageGroups.map((group) => (
              <article
                key={group.id}
                className={`group-card ${groupType === "artists" ? "artist-card" : ""}`}
              >
                <Link
                  {...link(groupType, group.id)}
                  className="group-cover"
                  aria-label={group.name}
                >
                  {groupType === "folders" ? (
                    <FolderArtwork />
                  ) : groupType === "genres" ? (
                    <GenreCover tracks={group.tracks} />
                  ) : (
                    <Cover
                      track={
                        group.tracks.find((track) => track.hasCover) ||
                        group.tracks[0]
                      }
                    />
                  )}
                </Link>
                <div className="group-copy">
                  <Link {...link(groupType, group.id)}>
                    <h3>{group.name}</h3>
                  </Link>
                  <p>
                    {groupType === "albums"
                      ? (splitMembers(group.artist || "").length
                          ? splitMembers(group.artist || "")
                          : ["__unknown__"]
                        ).map((artist, index) => (
                          <React.Fragment key={artist}>
                            {index > 0 && "; "}
                            <Link
                              {...link("artists", artist)}
                              className="album-artist-link"
                            >
                              {artist === "__unknown__"
                                ? t("unknownArtist")
                                : artist}
                            </Link>
                          </React.Fragment>
                        ))
                      : group.subtitle}
                  </p>
                  {groupType === "albums" && (
                    <small>
                      {group.year || t("unknownYear")} · {group.count}{" "}
                      {t("songs")}
                    </small>
                  )}
                </div>
                <IconButton
                  label={t("play")}
                  disabled={groupType === "folders" && !group.tracks.length}
                  onClick={() =>
                    player.replace(
                      groupType === "folders"
                        ? sortTracks(group.tracks, viewSort, view.desc)
                        : groupType === "playlists"
                          ? (() => {
                              const list = lib.playlists.find(
                                (p) => p.id === group.id,
                              );
                              return list?.smart
                                ? sortTracks(group.tracks, list.sort, list.desc)
                                : group.tracks;
                            })()
                          : sortTracks(group.tracks, "disc", false),
                      0,
                      groupType === "albums" ? "album" : "track",
                    )
                  }
                >
                  <Play size={18} fill="currentColor" />
                </IconButton>
              </article>
            ))}
          </div>
        ) : (
          <>
            <div
              className={view.grid ? "album-grid folder-grid" : "group-list"}
            >
              {pageFolders.map((name) => {
                const path = `${folder ? `${folder}/` : ""}${name}`;
                const destination = link("folders", `${sourceID}|${path}`);
                const folderTracks = sortTracks(
                  all.filter(
                    (track) =>
                      track.sourceId === sourceID &&
                      (track.folder === path ||
                        track.folder.startsWith(`${path}/`)),
                  ),
                  viewSort,
                  view.desc,
                );
                return (
                  <article className="group-card" key={name}>
                    <Link
                      {...destination}
                      className="group-cover"
                      aria-label={name}
                    >
                      <FolderArtwork />
                    </Link>
                    <div className="group-copy">
                      <Link {...destination}>
                        <h3>{name}</h3>
                      </Link>
                    </div>
                    <IconButton
                      label={`${t("play")} ${name}`}
                      disabled={!folderTracks.length}
                      onClick={() => player.replace(folderTracks)}
                    >
                      <Play size={18} fill="currentColor" />
                    </IconButton>
                  </article>
                );
              })}
            </div>
            <div
              className={
                view.grid
                  ? "song-grid"
                  : `song-list ${extraColumns.length ? "song-list-extra" : ""}`
              }
              style={
                !view.grid && extraColumns.length
                  ? ({
                      "--song-columns": `30px minmax(200px, 2fr) minmax(160px, 1fr) 50px 54px repeat(${extraColumns.length}, minmax(160px, 1fr)) 84px`,
                      "--song-list-width": `${720 + extraColumns.length * 174}px`,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              {!view.grid && (
                <div className="song-table-header">
                  <span>#</span>
                  <span>{t("title")}</span>
                  <span>
                    {isAlbumDetail
                      ? `${t("number")}${showDiscNumber ? ` / ${t("disc")}` : ""}`
                      : t("album")}
                  </span>
                  <span>{t("year")}</span>
                  <span>{t("duration")}</span>
                  {songColumns
                    .filter((column) => extraColumns.includes(column.id))
                    .map((column) => (
                      <span key={column.id}>{t(column.label)}</span>
                    ))}
                  <span />
                </div>
              )}
              {pageTracks.map((track, i) => (
                <article
                  className={`song-row ${track.missing ? "is-missing" : ""} ${playback.queue[playback.index]?.id === track.id ? "is-current" : ""}`}
                  key={track.id}
                >
                  {!view.grid && (
                    <label className="row-index">
                      <span>
                        {manual
                          ? (playlist?.tracks.indexOf(track.id) || 0) + 1
                          : start + i + 1}
                      </span>
                      <input
                        aria-label={`${t("select")} ${track.title || track.filename}`}
                        type="checkbox"
                        checked={selected.has(track.id)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(track.id);
                            else next.delete(track.id);
                            return next;
                          })
                        }
                      />
                    </label>
                  )}
                  <div className="song-main">
                    <button
                      type="button"
                      className="song-art"
                      aria-label={`${t("play")} ${track.title || track.filename}`}
                      onClick={() =>
                        player.replace(
                          tracks,
                          tracks.findIndex((t) => t.id === track.id),
                          section === "albums" && detail ? "album" : "track",
                        )
                      }
                      disabled={track.missing}
                    >
                      <Cover track={track} />
                      <Play size={16} fill="currentColor" />
                    </button>
                    <div>
                      <button
                        type="button"
                        className="song-title"
                        onClick={() =>
                          player.replace(
                            tracks,
                            tracks.findIndex((t) => t.id === track.id),
                            section === "albums" && detail ? "album" : "track",
                          )
                        }
                        disabled={track.missing}
                      >
                        {track.title || track.filename}
                        {track.missing && (
                          <small className="missing-label">
                            {t("missing")}
                          </small>
                        )}
                      </button>
                      <div className="artist-links">
                        {splitMembers(track.artist).length
                          ? splitMembers(track.artist).map((artist, i) => (
                              <React.Fragment key={artist}>
                                {i > 0 && ", "}
                                <Link {...link("artists", artist)}>
                                  {artist}
                                </Link>
                              </React.Fragment>
                            ))
                          : t("unknownArtist")}
                      </div>
                    </div>
                  </div>
                  {isAlbumDetail ? (
                    <span className="song-album song-track-number">
                      # {track.number || "—"}
                      {showDiscNumber && ` · CD ${track.disc || 1}`}
                    </span>
                  ) : (
                    <Link
                      {...link("albums", track.albumId)}
                      className="song-album"
                    >
                      {track.album || t("unknownAlbum")}
                    </Link>
                  )}
                  <span className="song-year">{track.year || "—"}</span>
                  <span className="song-duration">
                    {duration(track.duration)}
                  </span>
                  {!view.grid &&
                    extraColumns.map((id) => {
                      const value = songColumnValue(track, id, prefs.language);
                      return (
                        <span
                          key={id}
                          className="song-extra-value"
                          title={value}
                        >
                          {value}
                        </span>
                      );
                    })}
                  <div className="song-actions">
                    <FavoriteButton
                      label={t("favorite")}
                      active={track.favorite}
                      disabled={track.missing}
                      onClick={() => void favorite(track)}
                    >
                      <Heart
                        size={17}
                        fill={track.favorite ? "currentColor" : "none"}
                      />
                    </FavoriteButton>
                    {menu(track)}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        {total > 0 && (
          <footer className="pagination">
            <span>
              {t("page")} {currentPage} {t("of")} {maxPage}
            </span>
            <div>
              <Select
                aria-label={t("perPage")}
                value={view.size}
                onChange={(e) => updateView({ size: Number(e.target.value) })}
              >
                {[25, 50, 100].map((n) => (
                  <SelectOption key={n} value={n}>
                    {n}
                  </SelectOption>
                ))}
              </Select>
              <IconButton
                label={t("previousPage")}
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft size={18} />
              </IconButton>
              <IconButton
                label={t("nextPage")}
                disabled={currentPage === maxPage}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight size={18} />
              </IconButton>
            </div>
          </footer>
        )}
      </div>
      <DialogPresence>
        {newPlaylist && <PlaylistDialog close={() => setNewPlaylist(false)} />}
      </DialogPresence>
      <DialogPresence>
        {smart && (
          <PlaylistDialog
            rule={draft}
            sort={view.sort}
            desc={view.desc}
            close={() => setSmart(false)}
          />
        )}
      </DialogPresence>
      <DialogPresence>
        {editing && (
          <PlaylistDialog
            existing={editing}
            close={() => setEditing(undefined)}
          />
        )}
      </DialogPresence>
      <DialogPresence>
        {adding && (
          <Modal title={t("addToPlaylist")} close={() => setAdding(undefined)}>
            <div className="choose-playlist">
              {lib.playlists
                .filter((p) => !p.smart)
                .map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={async () => {
                      if (
                        await run(() =>
                          api(`/playlists/${p.id}/items`, "POST", {
                            action: "add",
                            ids: adding.map((t) => t.id),
                          }),
                        )
                      ) {
                        notice(t("saved"));
                        setAdding(undefined);
                      }
                    }}
                  >
                    <ListMusic size={20} />
                    {p.name}
                    <Plus size={16} />
                  </button>
                ))}
              <button type="button" onClick={() => setNewPlaylist(true)}>
                <Plus size={18} />
                {t("newPlaylist")}
              </button>
            </div>
          </Modal>
        )}
      </DialogPresence>
      <DialogPresence>
        {details && (
          <TrackDetails track={details} close={() => setDetails(undefined)} />
        )}
      </DialogPresence>
      <DialogPresence>
        {columnsOpen && (
          <Modal title={t("songColumns")} close={() => setColumnsOpen(false)}>
            <p className="help">{t("songColumnsHint")}</p>
            <div className="song-column-options">
              {songColumns.map((column) => (
                <label className="check" key={column.id}>
                  <input
                    type="checkbox"
                    checked={extraColumns.includes(column.id)}
                    onChange={(event) =>
                      changeColumns(
                        songColumns
                          .filter((item) =>
                            item.id === column.id
                              ? event.target.checked
                              : extraColumns.includes(item.id),
                          )
                          .map((item) => item.id),
                      )
                    }
                  />
                  {t(column.label)}
                </label>
              ))}
            </div>
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => changeColumns([])}
              >
                {t("reset")}
              </button>
            </footer>
          </Modal>
        )}
      </DialogPresence>
    </>
  );
}
const rootRoute = createRootRoute({
  component: () => (
    <AppProvider>
      <Shell />
    </AppProvider>
  ),
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/$section", params: { section: "home" } });
  },
});
const sectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$section",
  validateSearch: (search: Record<string, unknown>): { preset?: string } => ({
    preset:
      typeof search.preset === "string" &&
      ["recentlyAdded", "topSongs", "unheard", "topArtists"].includes(
        search.preset,
      )
        ? search.preset
        : undefined,
  }),
  component: BrowsePage,
});
const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$section/$detail",
  component: BrowsePage,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, sectionRoute, detailRoute]),
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
export default function App() {
  return <RouterProvider router={router} />;
}
