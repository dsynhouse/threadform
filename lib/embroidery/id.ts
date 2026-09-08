type RandomSource = Pick<Crypto, "getRandomValues"> &
  Partial<Pick<Crypto, "randomUUID">>;
/** RFC 4122 v4 IDs also work on local HTTP previews where randomUUID is absent.
 * getRandomValues remains cryptographic; never use Math.random for project IDs. */
export function createId(random: RandomSource = crypto): string {
  if (typeof random.randomUUID === "function") return random.randomUUID();
  const bytes = random.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
