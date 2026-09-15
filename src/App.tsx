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
  ArrowUpNarrowWide,
  ArrowUpRight,
  AudioLines,
  ChevronLeft,
  ChevronRight,
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
import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Cover,
  emptyRule,
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
  splitMembers,
  type Track,
} from "./model";
import { player } from "./player";
import { PlayerBar } from "./player-ui";
import { Select, SelectOption } from "./select";
import { SettingsPage } from "./settings";
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
  const { t, lib } = useApp();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/$section" params={{ section: "home" }} className="brand">
          <span className="brand-icon">
            <AudioLines size={24} />
          </span>
          harmonia<span className="brand-dot">.</span>
        </Link>
        <div className="library-caption">{t("library")}</div>
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
              {id === "favorites" && lib.tracks.some((t) => t.favorite) && (
                <span className="nav-count">
                  {lib.tracks.filter((t) => t.favorite).length}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link
            to="/$section"
            params={{ section: "settings" }}
            activeProps={{ className: "nav-active" }}
          >
            <Settings2 size={19} />
            {t("settings")}
          </Link>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
      <PlayerBar />
    </div>
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
  return (
    <Modal
      title={existing ? t("edit") : rule ? t("saveSmart") : t("newPlaylist")}
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (smartRule && !validateRule(smartRule)) {
            notice(t("ruleInvalid"));
            return;
          }
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
          )
            close();
        }}
      >
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
            {t("save")}
          </button>
        </footer>
      </form>
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
  const { t, lib, error, busy, reload, run, notice } = useApp();
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
  const [artistAlbums, setArtistAlbums] = useState(false);
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
    subheading = source?.error || t("currentFolder");
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
  const groupMode =
    (!detail &&
      ["albums", "artists", "genres", "playlists", "folders"].includes(
        section,
      )) ||
    (section === "artists" && !!detail && artistAlbums);
  const groupType =
    artistAlbums && section === "artists" && detail ? "albums" : section;
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
        subtitle: s.error || s.path,
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
              tracks.length > 0 && (
                <button
                  type="button"
                  className="primary"
                  onClick={() =>
                    player.replace(
                      tracks,
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
              {t("offline")}: {error}
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

          {section === "artists" && detail && (
            <div className="view-toggle">
              <IconButton
                label={t("albumView")}
                active={artistAlbums}
                onClick={() => {
                  setArtistAlbums(true);
                  setPage(1);
                }}
              >
                <Disc3 size={17} />
              </IconButton>
              <IconButton
                label={t("songView")}
                active={!artistAlbums}
                onClick={() => {
                  setArtistAlbums(false);
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
        ) : section === "folders" && !view.grid ? (
          <table className="file-browser" aria-label={t("folders")}>
            <tbody>
              <tr className="file-browser-row file-browser-header">
                <th scope="col">{t("filename")}</th>
                <th scope="col">{t("modifiedAt")}</th>
                <th scope="col">{t("createdAt")}</th>
                <th scope="col">{t("duration")}</th>
              </tr>
              {(groupMode
                ? pageGroups.map((group) => ({
                    id: group.id,
                    name: group.name,
                    modifiedAt: group.modifiedAt,
                    createdAt: group.createdAt,
                  }))
                : pageFolders.map((name) => {
                    const path = folder ? `${folder}/${name}` : name;
                    const times = lib.sources.find(
                      (source) => source.id === sourceID,
                    )?.folderTimes?.[path];
                    return { id: `${sourceID}|${path}`, name, ...times };
                  })
              ).map((entry) => (
                <tr className="file-browser-row" key={entry.id}>
                  <td>
                    <Link {...link("folders", entry.id)}>{entry.name}</Link>
                  </td>
                  <td>{formatFileTime(entry.modifiedAt)}</td>
                  <td>{formatFileTime(entry.createdAt)}</td>
                  <td>—</td>
                </tr>
              ))}
              {!groupMode &&
                pageTracks.map((track) => (
                  <tr className="file-browser-row" key={track.id}>
                    <td>
                      <button
                        type="button"
                        className="file-name"
                        disabled={track.missing}
                        onClick={() =>
                          player.replace(
                            tracks,
                            tracks.findIndex((item) => item.id === track.id),
                          )
                        }
                      >
                        {track.filename}
                      </button>
                    </td>
                    <td>{formatFileTime(track.modifiedAt)}</td>
                    <td>{formatFileTime(track.createdAt)}</td>
                    <td>{duration(track.duration)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : groupMode ? (
          <div
            className={
              view.grid
                ? `album-grid ${groupType === "folders" ? "folder-grid" : ""}`
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
                    <div className="folder-art">
                      <Folder size={38} />
                    </div>
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
                      <div className="folder-art">
                        <Folder size={38} />
                      </div>
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
            <div className={view.grid ? "song-grid" : "song-list"}>
              {!view.grid && (
                <div className="song-table-header">
                  <span>#</span>
                  <span>{t("title")}</span>
                  <span>{t("album")}</span>
                  <span>{t("year")}</span>
                  <span>{t("duration")}</span>
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
                      {section === "folders" && (
                        <small className="muted">{track.filename}</small>
                      )}
                    </div>
                  </div>
                  <Link
                    {...link("albums", track.albumId)}
                    className="song-album"
                  >
                    {track.album || t("unknownAlbum")}
                  </Link>
                  <span className="song-year">{track.year || "—"}</span>
                  <span className="song-duration">
                    {duration(track.duration)}
                  </span>
                  <div className="song-actions">
                    <IconButton
                      label={t("favorite")}
                      active={track.favorite}
                      disabled={track.missing}
                      onClick={() => void favorite(track)}
                    >
                      <Heart
                        size={17}
                        fill={track.favorite ? "currentColor" : "none"}
                      />
                    </IconButton>
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
          <Modal title={t("details")} close={() => setDetails(undefined)}>
            <div className="detail-summary">
              <Cover track={details} />
              <h3>{details.title || details.filename}</h3>
            </div>
            <dl className="details-list">
              {Object.entries(details)
                .filter(([k]) => !["cover", "lyrics", "tags"].includes(k))
                .map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>{t(k as TextKey) || k}</dt>
                    <dd>{String(v ?? "—")}</dd>
                  </React.Fragment>
                ))}
              {Object.entries(details.tags || {}).map(([k, v]) => (
                <React.Fragment key={`tag:${k}`}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </React.Fragment>
              ))}
            </dl>
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

function formatFileTime(value?: number) {
  return value ? new Date(value).toLocaleString() : "—";
}
