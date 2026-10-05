import { type LoginFlowOptions } from "./useLoginFlow.js";
export type LoginFormProps = LoginFlowOptions;
/**
 * "Continue with Google" plus a magic-link email field. No passwords.
 *
 * The default look for `useLoginFlow`, which owns every behaviour (guest
 * upgrade, the desktop-shell round trip, the `signin=force` loop guard). An
 * app that wants a different form calls the hook and draws its own.
 *
 * Must render inside a <Suspense> boundary. Colours come from the `auth-*`
 * tokens in auth.css.
 */
export declare function LoginForm(props: LoginFormProps): import("react").JSX.Element;
