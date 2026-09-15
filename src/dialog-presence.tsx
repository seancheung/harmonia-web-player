import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const PresenceContext = createContext(true);
export const useDialogPresence = () => useContext(PresenceContext);
export function DialogPresence({ children }: { children: ReactNode }) {
  const open = !!children;
  const retained = useRef<ReactNode>(null);
  const [exiting, setExiting] = useState(false);
  useLayoutEffect(() => {
    if (open) {
      retained.current = children;
      setExiting(true);
      return;
    }
    const timer = window.setTimeout(() => {
      retained.current = null;
      setExiting(false);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [open, children]);
  return (
    <PresenceContext.Provider value={open}>
      {open ? children : exiting ? retained.current : null}
    </PresenceContext.Provider>
  );
}
