import { expect, it } from "vitest";
import type { Track } from "./model";
import { formatMembers } from "./model";
import { trackColumnValue } from "./track-columns";

it("formats configured member separators without splitting names by default", () => {
  expect(formatMembers(" A; B; A ")).toBe("A / B");
  expect(formatMembers("Rock、Pop", "、")).toBe("Rock / Pop");
  expect(formatMembers("AC/DC; Guest")).toBe("AC/DC / Guest");
  expect(
    formatMembers("raw", "/", [{ name: "AC/DC" }, { name: "Guest" }]),
  ).toBe("AC/DC / Guest");
  expect(formatMembers(" ; ")).toBe("");
});
it("formats multi-value optional columns with the library separators", () => {
  const track = { albumArtist: "A; B", genre: "Rock、Pop" } as Track;
  expect(trackColumnValue(track, "albumArtist", "en", "、")).toBe("A / B");
  expect(trackColumnValue(track, "genre", "en", "、")).toBe("Rock / Pop");
});
