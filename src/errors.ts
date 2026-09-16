// Keep diagnostic URLs out of the UI and redact credentials before logging.
export function errorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error || "error");
  const detail = message.replace(
    /(token(?:=|%3D))[^&\s",]*(?=&|\s|"|,|$)/gi,
    "$1[redacted]",
  );
  console.error("[Harmonia]", detail);
  if (/queue outcome unknown/i.test(message)) return "airplayQueueUnknown";
  if (/deadline exceeded|timeout|timed out/i.test(message))
    return "requestTimeout";
  if (message.length > 180 || /https?:\/\//i.test(message))
    return "errorDetails";
  return message;
}
