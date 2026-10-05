// Safe anywhere: no React, no Next, no Supabase client. The UI lives in
// `@aimhuge/auth/client`, the route handlers and session helpers in
// `@aimhuge/auth/server`.
export { safeNextPath } from "./next-path.js";
export { identityFromUser, type SessionIdentity } from "./identity.js";
export type { DesktopAuth } from "./desktop.js";
