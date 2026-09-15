import {
  autoUpdate,
  FloatingFocusManager,
  FloatingPortal,
  flip,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  useTransitionStyles,
} from "@floating-ui/react";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "./context";
import { player } from "./player";

export function VolumeControl({ volume }: { volume: number }) {
  const { t } = useApp();
  const previous = useRef(volume > 0 ? volume : 0.75);
  useEffect(() => {
    if (volume > 0) previous.current = volume;
  }, [volume]);
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "top",
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip(), shift({ padding: 8 })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { handleClose: safePolygon(), delay: { close: 100 } }),
    useFocus(context),
    useDismiss(context),
    useRole(context, { role: "dialog" }),
  ]);
  const { isMounted, styles } = useTransitionStyles(context, {
    duration: { open: 150, close: 100 },
    initial: { opacity: 0, transform: "translateY(4px) scale(0.96)" },
    open: { opacity: 1, transform: "translateY(0) scale(1)" },
  });
  return (
    <>
      <button
        type="button"
        className="icon-button"
        ref={refs.setReference}
        aria-label={t(volume === 0 ? "unmute" : "mute")}
        title={t("volume")}
        aria-pressed={volume === 0}
        {...getReferenceProps({
          onClick: () => {
            if (volume > 0) previous.current = volume;
            player.volume(volume === 0 ? previous.current : 0);
          },
          onPointerDown: (event: React.PointerEvent) => {
            if (event.pointerType === "touch") setOpen(true);
          },
        })}
      >
        {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      {isMounted && (
        <FloatingPortal>
          <FloatingFocusManager
            context={context}
            modal={false}
            initialFocus={-1}
          >
            <div
              role="dialog"
              ref={refs.setFloating}
              className="volume-positioner"
              style={floatingStyles}
              aria-label={t("volume")}
              {...getFloatingProps()}
            >
              <div className="volume-popup" style={styles}>
                <span>{Math.round(volume * 100)}%</span>
                <input
                  type="range"
                  aria-label={t("volume")}
                  aria-orientation="vertical"
                  aria-valuetext={`${Math.round(volume * 100)}%`}
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  style={
                    { "--volume": `${volume * 100}%` } as React.CSSProperties
                  }
                  onChange={(event) =>
                    player.volume(Number(event.currentTarget.value))
                  }
                />
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
