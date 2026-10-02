import { useEffect, useRef, useState } from "react";
import { defaults, load } from "./model";

type Entry = { data: unknown; etag: string; saved: number };
const memory = new Map<string, Entry>();
const pending = new Map<string, Promise<Entry>>();
const limit = 120;
let epoch = 0;
const scrollPositions = new Map<string, number>();
function identity(path: string) {
  const p = load("preferences", defaults);
  return JSON.stringify([p.api, p.token, path]);
}
async function diskKey(key: string) {
  if (globalThis.crypto?.subtle) {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(key),
    );
    return Array.from(new Uint8Array(bytes), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
  }
  // HTTP LAN deployments may not expose Web Crypto. Never persist raw credentials.
  let a = 2166136261,
    b = 2246822507;
  for (let i = 0; i < key.length; i++) {
    a = Math.imul(a ^ key.charCodeAt(i), 16777619);
    b = Math.imul(b ^ key.charCodeAt(i), 3266489909);
  }
  return `${key.length}:${a >>> 0}:${b >>> 0}`;
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("harmonia-pages-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pages");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readDisk(key: string): Promise<Entry | undefined> {
  try {
    const id = await diskKey(key),
      db = await database();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("pages", "readonly"),
        r = tx.objectStore("pages").get(id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      tx.oncomplete = () => db.close();
      tx.onabort = () => db.close();
    });
  } catch {
    return undefined;
  }
}
async function writeDisk(key: string, entry: Entry) {
  try {
    const id = await diskKey(key),
      db = await database();
    const tx = db.transaction("pages", "readwrite"),
      store = tx.objectStore("pages");
    store.put(entry, id);
    const keys: { key: IDBValidKey; saved: number; size: number }[] = [];
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c) {
        keys.push({
          key: c.key,
          saved: c.value.saved,
          size: JSON.stringify(c.value).length,
        });
        c.continue();
      } else {
        keys.sort((a, b) => b.saved - a.saved);
        let size = 0;
        keys.forEach((item, i) => {
          size += item.size;
          if (i >= limit || size > 20_000_000) store.delete(item.key);
        });
      }
    };
    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
  } catch {
    /* Storage denial must not prevent online use. */
  }
}
function remember(key: string, entry: Entry) {
  memory.delete(key);
  memory.set(key, entry);
  let size = [...memory.values()].reduce(
    (sum, value) => sum + JSON.stringify(value).length,
    0,
  );
  while (memory.size > limit || size > 20_000_000) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    size -= JSON.stringify(memory.get(oldest)).length;
    memory.delete(oldest);
  }
}
export async function cachedPage<T>(path: string): Promise<T | undefined> {
  const key = identity(path);
  let entry = memory.get(key);
  if (!entry) {
    entry = await readDisk(key);
    if (entry) remember(key, entry);
  }
  return entry?.data as T | undefined;
}
export async function fetchPage<T>(path: string): Promise<T> {
  const key = identity(path);
  const existing = pending.get(key);
  if (existing) return (await existing).data as T;
  const generation = epoch;
  const request = (async () => {
    let cached = memory.get(key);
    if (!cached) {
      cached = await readDisk(key);
      if (cached) remember(key, cached);
    }
    const [address, token] = JSON.parse(key) as string[];
    const response = await fetch(`${address}/api${path}`, {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cached?.etag ? { "If-None-Match": cached.etag } : {}),
      },
      cache: "no-store",
    });
    if (response.status === 304 && cached) return cached;
    const invalidResponse = address
      ? "apiInvalidResponse"
      : "apiServerUnconfigured";
    if (response.headers.get("Content-Type")?.includes("text/html"))
      throw new Error(invalidResponse);
    const data = await response.json().catch(() => {
      throw new Error(invalidResponse);
    });
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    const entry = {
      data,
      etag: response.headers.get("ETag") || "",
      saved: Date.now(),
    };
    if (generation === epoch) {
      remember(key, entry);
      void writeDisk(key, entry);
    }
    return entry;
  })();
  pending.set(key, request);
  try {
    return (await request).data as T;
  } finally {
    if (pending.get(key) === request) pending.delete(key);
  }
}
export function invalidatePages() {
  epoch++;
  pending.clear();
  window.dispatchEvent(new Event("harmonia:pages"));
}
export function usePage<T>(path: string) {
  const key = identity(path);
  const [state, setState] = useState<{ key: string; data?: T; error: string }>({
    key,
    data: memory.get(key)?.data as T | undefined,
    error: "",
  });
  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = async () => {
      const current = ++revision;
      try {
        const data = await fetchPage<T>(path);
        if (active && current === revision) setState({ key, data, error: "" });
      } catch (e) {
        if (active && current === revision)
          setState((old) => ({
            key,
            data: old.key === key ? old.data : undefined,
            error: e instanceof Error ? e.message : String(e),
          }));
      }
    };
    void (async () => {
      const data = await cachedPage<T>(path);
      if (!active) return;
      setState({ key, data, error: "" });
      await refresh();
    })();
    const foreground = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("harmonia:pages", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => {
      active = false;
      window.removeEventListener("harmonia:pages", foreground);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [key, path]);
  const restored = useRef("");
  useEffect(() => {
    const save = () => scrollPositions.set(key, window.scrollY);
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, [key]);
  const data =
    state.key === key ? state.data : (memory.get(key)?.data as T | undefined);
  useEffect(() => {
    if (data !== undefined && restored.current !== key) {
      restored.current = key;
      const position = scrollPositions.get(key) || 0;
      const frame = requestAnimationFrame(() =>
        window.scrollTo({ top: position, behavior: "instant" }),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [key, data]);
  return {
    data,
    loading: data === undefined && !(state.key === key && state.error),
    error: state.key === key ? state.error : "",
    refresh: invalidatePages,
  };
}
