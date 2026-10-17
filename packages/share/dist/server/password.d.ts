/** A share password, hashed with scrypt and its salt embedded:
 *  "scrypt$<salt hex>$<hash hex>". */
export declare function hashSharePassword(password: string): string;
export declare function verifySharePassword(password: string, stored: string | null | undefined): boolean;
