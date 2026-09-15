import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { memo, useEffect, useRef } from "react";
import { Cover, IconButton } from "./components";
import { useApp } from "./context";
import type { Track } from "./model";
import { player } from "./player";

export const QueueList = memo(function QueueList({
  queue,
  index,
  open,
}: {
  queue: Track[];
  index: number;
  open: boolean;
}) {
  const { t } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: queue.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 68,
    overscan: 5,
    getItemKey: (i) => `${queue[i].id}-${i}`,
  });
  useEffect(() => {
    if (open && queue.length) virtual.scrollToIndex(index, { align: "center" });
  }, [open, index, queue.length, virtual]);
  return (
    <div className="queue-scroll" ref={scrollRef}>
      {!queue.length && <p className="panel-empty">{t("queueEmpty")}</p>}
      <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
        {virtual.getVirtualItems().map((row) => {
          const item = queue[row.index];
          const i = row.index;
          return (
            <div
              key={row.key}
              data-index={i}
              ref={virtual.measureElement}
              className={`queue-item ${i === index ? "is-current" : ""}`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${row.start}px)`,
              }}
            >
              <button
                type="button"
                onClick={() => player.select(i)}
                aria-current={i === index ? "true" : undefined}
              >
                <Cover track={item} />
                <span>
                  <strong>{item.title || item.filename}</strong>
                  <small>
                    {item.missing
                      ? t("missing")
                      : item.artist || t("unknownArtist")}
                  </small>
                </span>
              </button>
              <IconButton
                label={t("previous")}
                disabled={i === 0}
                onClick={() => player.move(i, i - 1)}
              >
                <ArrowUp size={14} />
              </IconButton>
              <IconButton
                label={t("next")}
                disabled={i === queue.length - 1}
                onClick={() => player.move(i, i + 1)}
              >
                <ArrowDown size={14} />
              </IconButton>
              <IconButton label={t("remove")} onClick={() => player.remove(i)}>
                <X size={14} />
              </IconButton>
            </div>
          );
        })}
      </div>
    </div>
  );
});
