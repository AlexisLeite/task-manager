import { randomBytes, scrypt, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const actual = await derive(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
export const sessionHash = (token) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
export const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
