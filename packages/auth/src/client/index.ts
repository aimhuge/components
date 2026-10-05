// Every module behind this entry is a "use client" module, so a Server
// Component can import from here: what it gets are client references.
export { LoginForm, type LoginFormProps } from "./LoginForm.js";
export { SignedInPrompt } from "./SignedInPrompt.js";
export { useAuth, type UseAuthOptions } from "./useAuth.js";
export { getSupabaseBrowser } from "./supabase-browser.js";
