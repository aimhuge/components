import { type SessionIdentity } from "../identity.js";
/**
 * Who is signed in on this request, for the "already signed in" banner on the
 * sign-in page. Null for a visitor, and null when the probe fails for any
 * reason (backend down, token rejected): the page then just shows the form.
 *
 * Uncached on purpose. An app that wants the page shell prerendered wraps this
 * in its own `"use cache: private"` function — the only cache scope that may
 * read cookies — rather than the package deciding a cache lifetime for it.
 */
export declare function readSessionIdentity(): Promise<SessionIdentity | null>;
