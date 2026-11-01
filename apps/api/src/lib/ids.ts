const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Random id; 16 chars of base36 ≈ 82 bits. */
export function newId(len = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % 36];
  return out;
}

/** Unguessable capability token for share links and media keys (~190 bits). */
export function newToken(): string {
  return newId(37);
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
