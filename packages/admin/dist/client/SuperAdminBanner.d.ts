export interface SuperAdminSession {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    teamSlug?: string | null;
    teamId?: string | null;
    isSuperAdmin?: boolean;
}
export declare function SuperAdminBanner({ session }: {
    session: SuperAdminSession | null | undefined;
}): import("react").JSX.Element;
