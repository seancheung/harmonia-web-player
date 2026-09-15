import {
  autoUpdate,
  FloatingFocusManager,
  FloatingOverlay,
  FloatingPortal,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
  useTransitionStyles,
} from "@floating-ui/react";
import { MoreHorizontal, Music2, Plus, Trash2, X } from "lucide-react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { type ComponentProps, type ReactNode, useRef, useState } from "react";
import { useApp } from "./context";
import { useDialogPresence } from "./dialog-presence";
import type { TextKey } from "./i18n";
import { mediaURL, type Rule, type Track } from "./model";
import { Select, SelectOption } from "./select";

export function IconButton({
  label,
  children,
  onClick,
  active,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function FavoriteButton({
  label,
  children,
  onClick,
  active,
  disabled = false,
}: ComponentProps<typeof IconButton>) {
  const controls = useAnimationControls();
  const reducedMotion = useReducedMotion();
  return (
    <motion.button
      type="button"
      className={`icon-button ${active ? "active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      animate={controls}
      whileTap={!disabled && !reducedMotion ? { scale: 0.85 } : undefined}
      onClick={() => {
        if (!reducedMotion) {
          controls.stop();
          void controls.start({
            scale: active ? [0.9, 1.08, 1] : [0.85, 1.22, 0.96, 1],
            transition: { duration: 0.3, ease: "easeOut" },
          });
        }
        onClick?.();
      }}
    >
      {children}
    </motion.button>
  );
}
export function Cover({
  track,
  className = "",
}: {
  track?: Track;
  className?: string;
}) {
  const [failed, setFailed] = useState("");
  const url = track && track.hasCover !== false ? mediaURL(track, "cover") : "";
  return (
    <div
      className={`cover ${className}`}
      style={
        {
          "--cover-hue": `${track ? Number.parseInt(track.albumId.slice(-6), 16) % 360 : 15}`,
        } as React.CSSProperties
      }
    >
      {url && failed !== url ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(url)} />
      ) : (
        <div className="cover-placeholder">
          <span />
          <Music2 size={40} strokeWidth={1.3} />
          <span />
        </div>
      )}
    </div>
  );
}
export function FolderArtwork() {
  return (
    <div className="folder-art">
      <svg viewBox="0 0 200 160" aria-hidden="true">
        <path
          className="folder-icon-back"
          d="M8 38V24A12 12 0 0 1 20 12h42c9 0 13 3 19 10l10 12h89a12 12 0 0 1 12 12v96H8Z"
        />
        <path
          className="folder-icon-edge"
          d="M8 56a12 12 0 0 1 12-12h48c9 0 14-3 21-9h91a12 12 0 0 1 12 12v97a12 12 0 0 1-12 12H20a12 12 0 0 1-12-12Z"
        />
        <path
          className="folder-icon-front"
          d="M8 58a12 12 0 0 1 12-12h48c9 0 14-3 21-9h91a12 12 0 0 1 12 12v91a12 12 0 0 1-12 12H20a12 12 0 0 1-12-12Z"
        />
      </svg>
    </div>
  );
}
export function GenreCover({ tracks }: { tracks: Track[] }) {
  const albums = new Set<string>();
  const covers: Track[] = [];
  for (const track of tracks) {
    if (!track.hasCover || albums.has(track.albumId)) continue;
    albums.add(track.albumId);
    covers.push(track);
    if (covers.length === 4) break;
  }
  if (covers.length < 2) return <Cover track={covers[0] || tracks[0]} />;
  return (
    <div className={`genre-cover genre-cover-${covers.length}`}>
      {covers.map((track) => (
        <Cover key={track.albumId} track={track} />
      ))}
    </div>
  );
}
export function Menu({
  children,
  items,
  trigger,
  label,
  className = "icon-button",
}: {
  children?: (close: () => void) => ReactNode;
  items?: { label: string; icon: ReactNode; onSelect: () => void }[];
  trigger?: ReactNode;
  label?: string;
  className?: string;
}) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const { refs, floatingStyles, context, placement } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
        },
      }),
    ],
  });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [
      useClick(context, { event: "mousedown" }),
      useDismiss(context),
      useRole(context, { role: "menu" }),
      useListNavigation(context, {
        enabled: !!items,
        listRef,
        activeIndex,
        onNavigate: setActiveIndex,
        loop: true,
        focusItemOnOpen: false,
      }),
    ],
  );
  const above = placement.startsWith("top");
  const { isMounted, styles } = useTransitionStyles(context, {
    duration: { open: 150, close: 100 },
    initial: {
      opacity: 0,
      transform: `scale(0.96) translateY(${above ? 4 : -4}px)`,
    },
    open: { opacity: 1, transform: "scale(1) translateY(0)" },
  });
  const close = () => {
    setOpen(false);
    setActiveIndex(null);
  };
  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        className={className}
        aria-label={label || t("more")}
        {...getReferenceProps()}
      >
        {trigger || <MoreHorizontal size={19} />}
      </button>
      {isMounted && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className="menu-positioner"
              {...getFloatingProps()}
            >
              <div
                className={`menu ${items ? "menu-actions" : ""}`}
                style={{
                  ...styles,
                  maxHeight: "inherit",
                  transformOrigin: above ? "bottom" : "top",
                }}
              >
                {items
                  ? items.map((item, index) => (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        tabIndex={activeIndex === index ? 0 : -1}
                        data-active={activeIndex === index}
                        ref={(node) => {
                          listRef.current[index] = node;
                        }}
                        {...getItemProps({
                          onClick: () => {
                            close();
                            item.onSelect();
                          },
                        })}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
                    ))
                  : children?.(close)}
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const { t } = useApp();
  const { refs, context } = useFloating({
    open: useDialogPresence(),
    onOpenChange: (open) => {
      if (!open) close();
    },
  });
  const { getFloatingProps } = useInteractions([
    useDismiss(context),
    useRole(context, { role: "dialog" }),
  ]);
  const { styles: contentStyles } = useTransitionStyles(context, {
    duration: { open: 200, close: 150 },
    initial: { opacity: 0, transform: "scale(0.96)" },
    open: { opacity: 1, transform: "scale(1)" },
  });
  const { styles: overlayStyles } = useTransitionStyles(context, {
    duration: { open: 200, close: 150 },
    initial: { opacity: 0 },
    open: { opacity: 1 },
  });
  return (
    <FloatingPortal>
      <FloatingOverlay
        lockScroll
        className="modal-backdrop"
        style={overlayStyles}
      >
        <FloatingFocusManager context={context}>
          <section
            ref={refs.setFloating}
            className="modal"
            style={contentStyles}
            {...getFloatingProps()}
            aria-label={title}
          >
            <header>
              <h2>{title}</h2>
              <IconButton label={t("cancel")} onClick={close}>
                <X size={20} />
              </IconButton>
            </header>
            {children}
          </section>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}

export const emptyRule = (): Rule => ({
  mode: "all",
  rules: [{ field: "genre", op: "contains", value: "" }],
});
export function validateRule(rule: Rule) {
  let count = 0;
  function walk(r: Rule, depth: number): boolean {
    count++;
    if (count > 30 || depth > 4) return false;
    if (r.mode)
      return (
        !!r.rules?.length &&
        r.rules.every((c) => walk(c, depth + (c.mode ? 1 : 0)))
      );
    if (!r.field || !r.op) return false;
    if (r.field === "folder") return !!r.sourceId;
    if (
      [
        "year",
        "duration",
        "playCount",
        "addedAt",
        "disc",
        "number",
        "bitrate",
        "sampleRate",
        "bpm",
      ].includes(r.field)
    )
      return String(r.value) !== "" && Number.isFinite(Number(r.value));
    return r.value !== undefined && String(r.value) !== "";
  }
  return walk(rule, 1);
}
export function RuleEditor({
  rule,
  onChange,
  depth = 1,
}: {
  rule: Rule;
  onChange: (r: Rule) => void;
  depth?: number;
}) {
  const { t, lib } = useApp();
  const fields = [
    "title",
    "artist",
    "album",
    "albumArtist",
    "genre",
    "year",
    "duration",
    "favorite",
    "playCount",
    "addedAt",
    "folder",
    "disc",
    "number",
    "bitrate",
    "sampleRate",
    "bpm",
    "format",
    "key",
    "tag",
  ];
  if (rule.mode)
    return (
      <div className="rule-group">
        <div className="rule-header">
          <Select
            aria-label={t("filter")}
            value={rule.mode}
            onChange={(e) =>
              onChange({ ...rule, mode: e.target.value as "all" | "any" })
            }
          >
            <SelectOption value="all">{t("all")}</SelectOption>
            <SelectOption value="any">{t("any")}</SelectOption>
          </Select>
          <span className="muted">{depth} / 4</span>
        </div>
        {rule.rules?.map((child, i) => (
          <div className="rule-child" key={`${i}-${child.mode || "condition"}`}>
            <RuleEditor
              rule={child}
              depth={depth + (child.mode ? 1 : 0)}
              onChange={(next) =>
                onChange({
                  ...rule,
                  rules: rule.rules?.map((r, j) => (j === i ? next : r)),
                })
              }
            />
            <IconButton
              label={t("remove")}
              onClick={() =>
                onChange({
                  ...rule,
                  rules: rule.rules?.filter((_, j) => j !== i),
                })
              }
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
        <div className="flex gap-2">
          <button
            type="button"
            className="subtle"
            onClick={() =>
              onChange({
                ...rule,
                rules: [
                  ...(rule.rules || []),
                  { field: "genre", op: "contains", value: "" },
                ],
              })
            }
          >
            <Plus size={14} />
            {t("addRule")}
          </button>
          {depth < 4 && (
            <button
              type="button"
              className="subtle"
              onClick={() =>
                onChange({
                  ...rule,
                  rules: [...(rule.rules || []), emptyRule()],
                })
              }
            >
              <Plus size={14} />
              {t("addGroup")}
            </button>
          )}
        </div>
      </div>
    );
  const numeric = [
    "year",
    "duration",
    "playCount",
    "addedAt",
    "disc",
    "number",
    "bitrate",
    "sampleRate",
    "bpm",
  ].includes(rule.field || "");
  const folderOptions = lib.sources.flatMap((s) =>
    [
      "",
      ...new Set(
        lib.tracks
          .filter((t) => !t.missing && t.sourceId === s.id)
          .flatMap((t) => {
            const parts = t.folder.split("/").filter(Boolean);
            return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
          }),
      ),
    ].map((path) => ({
      source: s.id,
      path,
      label: `${s.name} / ${path || "/"}`,
    })),
  );
  const folderValid = folderOptions.some(
    (o) => o.source === rule.sourceId && o.path === rule.value,
  );
  return (
    <div className="rule-condition">
      <Select
        aria-label={t("filter")}
        value={rule.field?.startsWith("tag:") ? "tag" : rule.field}
        onChange={(e) =>
          onChange({
            field: e.target.value === "tag" ? "tag:" : e.target.value,
            op: [
              "folder",
              "favorite",
              "year",
              "duration",
              "playCount",
              "addedAt",
              "disc",
              "number",
              "bitrate",
              "sampleRate",
              "bpm",
            ].includes(e.target.value)
              ? "eq"
              : "contains",
            value: e.target.value === "favorite" ? true : "",
          })
        }
      >
        {fields.map((f) => (
          <SelectOption key={f} value={f}>
            {t(f as TextKey) || f}
          </SelectOption>
        ))}
      </Select>
      <Select
        aria-label={t("eq")}
        value={rule.op}
        onChange={(e) => onChange({ ...rule, op: e.target.value })}
      >
        {(rule.field === "folder" || rule.field === "favorite"
          ? ["eq", "ne"]
          : numeric
            ? ["eq", "ne", "gt", "gte", "lt", "lte"]
            : ["contains", "notContains", "eq", "ne"]
        ).map((op) => (
          <SelectOption key={op} value={op}>
            {t(op as TextKey)}
          </SelectOption>
        ))}
      </Select>
      {rule.field === "folder" ? (
        <>
          <Select
            aria-label={t("folder")}
            value={`${rule.sourceId || ""}|${rule.value || ""}`}
            onChange={(e) => {
              const [sourceId, ...path] = e.target.value.split("|");
              onChange({ ...rule, sourceId, value: path.join("|") });
            }}
          >
            <SelectOption value="|">{t("select")}</SelectOption>
            {!folderValid && rule.sourceId && (
              <SelectOption value={`${rule.sourceId}|${rule.value}`}>
                {t("folderGone")} {rule.value}
              </SelectOption>
            )}
            {folderOptions.map((o) => (
              <SelectOption
                key={`${o.source}|${o.path}`}
                value={`${o.source}|${o.path}`}
              >
                {o.label}
              </SelectOption>
            ))}
          </Select>
          <label className="check">
            <input
              type="checkbox"
              checked={!!rule.recursive}
              onChange={(e) =>
                onChange({ ...rule, recursive: e.target.checked })
              }
            />
            {t("recursive")}
          </label>
          {!folderValid && rule.sourceId && (
            <small className="error-text">
              {lib.sources.find((s) => s.id === rule.sourceId)?.error ||
                t("folderGone")}
            </small>
          )}
        </>
      ) : rule.field === "favorite" ? (
        <Select
          value={String(rule.value)}
          onChange={(e) =>
            onChange({ ...rule, value: e.target.value === "true" })
          }
        >
          <SelectOption value="true">{t("favorite")}</SelectOption>
          <SelectOption value="false">{t("off")}</SelectOption>
        </Select>
      ) : (
        <>
          {rule.field?.startsWith("tag:") && (
            <input
              placeholder={t("tagName")}
              value={rule.field.slice(4)}
              onChange={(e) =>
                onChange({ ...rule, field: `tag:${e.target.value}` })
              }
            />
          )}
          <input
            aria-label={t("fullText")}
            type={
              rule.field === "addedAt"
                ? "datetime-local"
                : numeric
                  ? "number"
                  : "text"
            }
            value={
              rule.field === "addedAt" && rule.value
                ? new Date(
                    Number(rule.value) -
                      new Date(Number(rule.value)).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)
                : String(rule.value ?? "")
            }
            onChange={(e) =>
              onChange({
                ...rule,
                value:
                  rule.field === "addedAt" && e.target.value !== ""
                    ? new Date(e.target.value).getTime()
                    : numeric && e.target.value !== ""
                      ? Number(e.target.value)
                      : e.target.value,
              })
            }
          />
        </>
      )}
    </div>
  );
}
