// Server-side entry point. The page guard lives here; client components are
// re-exported from the package root for symmetry with `@aimhuge/teams`.
export { requireSuperAdmin, isAdminCaller, } from "./requireSuperAdmin.js";
