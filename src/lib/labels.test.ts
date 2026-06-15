import { describe, it, expect } from "vitest";
import { formatDuration } from "./labels";

describe("formatDuration", () => {
  it("renders an em dash for missing/zero/negative durations", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(-5)).toBe("—");
  });
  it("renders seconds under a minute", () => {
    expect(formatDuration(45)).toBe("45s");
  });
  it("renders minutes and seconds at or above a minute", () => {
    expect(formatDuration(60)).toBe("1m 0s");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(605)).toBe("10m 5s");
  });
});
