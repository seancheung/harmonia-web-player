import { describe, expect, it } from "vitest";
import { ShufflePlayback } from "./shuffle-playback";

describe("shuffle rounds", () => {
  it("consumes each unique track once and stops", () => {
    for (let run = 0; run < 100; run++) {
      const s = new ShufflePlayback();
      s.select("a");
      const played = ["a"];
      for (let i = 0; i < 3; i++) {
        const id = required(s.peek(["a", "b", "c", "d", "a"], false));
        expect(s.peek(["a", "b", "c", "d"], false)).toBe(id);
        s.advance(id);
        played.push(id);
      }
      expect(new Set(played).size).toBe(4);
      expect(s.peek(played, false)).toBeUndefined();
    }
  });

  it("keeps every round unique and avoids boundary repeats", () => {
    const s = new ShufflePlayback();
    const ids = ["a", "b", "c"];
    let last: string | undefined;
    for (let round = 0; round < 100; round++) {
      const played = [];
      for (let i = 0; i < 3; i++) {
        const id = required(s.peek(ids, true));
        expect(id).not.toBe(last);
        s.advance(id);
        played.push(id);
        last = id;
      }
      expect(new Set(played).size).toBe(3);
    }
  });

  it("replays history without consuming upcoming tracks", () => {
    const s = new ShufflePlayback();
    const ids = ["a", "b", "c"];
    s.select("a");
    const second = required(s.peek(ids, false));
    s.advance(second);
    const third = required(s.peek(ids, false));
    expect(s.previous(ids)).toBe("a");
    expect(s.peek(ids, false)).toBe(second);
    s.advance(second);
    expect(s.peek(ids, false)).toBe(third);
    s.advance(third);
    expect(s.peek(ids, false)).toBeUndefined();
  });

  it("preserves progress when tracks are added, removed, reordered or fail", () => {
    const s = new ShufflePlayback();
    s.select("a");
    const second = required(s.peek(["a", "b", "c"], false));
    s.advance(second);
    expect(s.peek([second, "d", "a"], false)).toBe("d");
    s.advance("d");
    expect(s.peek(["d", "a", second], false)).toBeUndefined();
    expect(s.previous(["a", "d"])).toBe("a");
    expect(s.peek(["a", "d"], false)).toBe("d");
  });

  it("does not start a new round just because it was preloaded", () => {
    const s = new ShufflePlayback();
    s.select("a");
    s.advance(required(s.peek(["a", "b"], false)));
    expect(s.peek(["a", "b"], true)).toBe("a");
    expect(s.peek(["a", "b"], false)).toBeUndefined();
    expect(s.peek([], true)).toBeUndefined();
  });

  it("handles manual selection and single-track queues", () => {
    const s = new ShufflePlayback();
    s.select("a");
    s.select("b");
    expect(s.peek(["a", "b", "c"], false)).toBe("c");
    const single = new ShufflePlayback();
    single.select("a");
    expect(single.peek(["a"], false)).toBeUndefined();
    expect(single.peek(["a"], true)).toBe("a");
  });
});

function required(id: string | undefined): string {
  if (id === undefined) throw new Error("Expected an upcoming track");
  return id;
}
