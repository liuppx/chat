export function prettyObject(msg: any) {
  const obj = msg;
  if (typeof msg !== "string") {
    msg = JSON.stringify(msg, null, "  ");
  }
  if (msg === "{}") {
    return obj.toString();
  }
  if (msg.startsWith("```json")) {
    return msg;
  }
  return ["```json", msg, "```"].join("\n");
}

export function* chunks(s: string, maxBytes = 1000 * 1000) {
  const encoder = new TextEncoder();
  let current = "";
  let currentBytes = 0;

  for (const char of s) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > maxBytes && current.length > 0) {
      yield current;
      current = char;
      currentBytes = charBytes;
      continue;
    }
    current += char;
    currentBytes += charBytes;
  }

  if (current.length > 0) {
    yield current;
  }
}
