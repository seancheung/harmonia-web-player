import { describe, expect, it } from "vitest";
import { decodeWaveform } from "./waveform";

describe("binary waveform", () => {
  it("reads little-endian peaks", () => {
    const data = new ArrayBuffer(1025);
    new DataView(data).setUint8(0, 1);
    new DataView(data).setUint16(1, 1000, true);
    const peaks = decodeWaveform(data);
    expect(peaks).toHaveLength(512);
    expect(peaks[0]).toBe(1000);
    expect(peaks[511]).toBe(0);
  });
  it("rejects malformed data", () => {
    expect(() => decodeWaveform(new ArrayBuffer(1023))).toThrow();
    expect(() => decodeWaveform(new ArrayBuffer(1026))).toThrow();
    const data = new ArrayBuffer(1025);
    new DataView(data).setUint8(0, 1);
    new DataView(data).setUint16(1, 1001, true);
    expect(() => decodeWaveform(data)).toThrow();
    new DataView(data).setUint16(1, 0, true);
    new DataView(data).setUint8(0, 2);
    expect(() => decodeWaveform(data)).toThrow();
  });
});
