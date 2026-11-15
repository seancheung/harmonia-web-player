export function decodeWaveform(data: ArrayBuffer): number[] {
  if (data.byteLength !== 1025) throw new Error("Invalid waveform length");
  const view = new DataView(data);
  if (view.getUint8(0) !== 1) throw new Error("Unsupported waveform version");
  return Array.from({ length: 512 }, (_, index) => {
    const peak = view.getUint16(1 + index * 2, true);
    if (peak > 1000) throw new Error("Invalid waveform peak");
    return peak;
  });
}
