import { useQuery } from "@tanstack/react-query";
import { backendUrl } from "./txline/config";

export interface Profile {
    id: string;
    wallet: string;
    username: string | null;
    bio: string | null;
    avatar: string | null;
    createdAt?: string;
    updatedAt?: string;
    // contest stats (default 0 until the predictions feature populates them)
    points?: number;
    predictions?: number;
    wins?: number;
    currentStreak?: number;
}

export const avatarUrl = (seed?: string) =>
    `https://api.dicebear.com/10.x/glyphs/svg?seed=${encodeURIComponent(seed || "guest")}`;

export async function getProfile(wallet: string): Promise<Profile | null> {
    const r = await fetch(`${backendUrl}/api/users/${wallet}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}

export async function saveProfile(data: {
    wallet: string;
    username: string;
    bio?: string;
    avatar?: string;
}): Promise<Profile> {
    const r = await fetch(`${backendUrl}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
    return body;
}

export function useProfile(wallet?: string) {
    return useQuery({
        queryKey: ["profile", wallet],
        enabled: !!wallet,
        staleTime: 60_000,
        queryFn: () => getProfile(wallet!),
    });
}
