import { useQuery } from "@tanstack/react-query";
import type { TxlineFixture } from "@/lib/markets/from-fixtures";
import type { TxlineCreds } from "./creds";

async function fetchFixtures(creds: TxlineCreds): Promise<TxlineFixture[]> {
    const res = await fetch("/api/txline/fixtures", {
        headers: { "x-jwt": creds.jwt, "x-api-token": creds.apiToken },
    });
    const data = await res.json();
    if (data.error) {
        throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
    }
    return Array.isArray(data.fixtures) ? data.fixtures : [];
}

/** Live TxLINE fixtures. Only runs once real credentials are available. */
export function useFixtures(creds: TxlineCreds | null) {
    return useQuery({
        queryKey: ["fixtures"],
        queryFn: () => fetchFixtures(creds as TxlineCreds),
        enabled: !!creds,
    });
}
