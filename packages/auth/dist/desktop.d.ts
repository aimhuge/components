/**
 * What an app with a desktop shell (DeckCP's Electron app) tells the sign-in
 * code. Google refuses OAuth inside an embedded webview, so inside a shell the
 * authorize page has to open in the system browser and the round trip has to
 * come back to the app rather than to the tab that ran it.
 *
 * Apps without a shell pass nothing and get the plain web flow.
 */
export interface DesktopAuth {
    /** True inside the shell. Called at click time, never during render. */
    isDesktop(): boolean;
    /** The `redirectTo` / `emailRedirectTo` for a round trip that must land back in the app. */
    redirectTo(next: string): string;
    /** Where to land inside the shell when the URL has no `?next=`. */
    defaultNext: string;
    /** Where a signed-out shell goes. `useAuth().signOut()` navigates there itself. */
    signedOutPath: string;
    /** Open a URL in the system browser. */
    openExternal(url: string): Promise<void>;
}
