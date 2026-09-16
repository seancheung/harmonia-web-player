import { expect, it, vi } from "vitest";
import { errorMessage } from "./errors";

it("summarizes timeouts and redacts stream credentials in diagnostics", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(
      errorMessage(
        new Error(
          'Post "http://own/add?uris=http%3A%2F%2Fhost%2Fstream%3Ftoken%3Dsecret": context deadline exceeded',
        ),
      ),
    ).toBe("requestTimeout");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    expect(
      errorMessage(
        "AirPlay queue outcome unknown; OwnTone may still be adding tracks: timeout",
      ),
    ).toBe("airplayQueueUnknown");
    expect(errorMessage("x".repeat(2000))).toBe("errorDetails");
  } finally {
    log.mockRestore();
  }
});
