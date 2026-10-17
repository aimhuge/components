import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
/** A share password, hashed with scrypt and its salt embedded:
 *  "scrypt$<salt hex>$<hash hex>". */
export function hashSharePassword(password) {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 32);
    return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
export function verifySharePassword(password, stored) {
    if (!stored)
        return false;
    const [scheme, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt" || !saltHex || !hashHex || stored.split("$").length !== 3)
        return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
