/**
 * Sign the current user out and go back to `/login`, keeping `next` when it is
 * a same-origin path so the visitor lands on the form for the same target.
 *
 * The banner's "Switch account" button calls this through a `<form action>`,
 * so it is a real POST and not a GET someone could be tricked into firing.
 */
export declare function signOutAndRedirect(currentPath?: string): Promise<void>;
