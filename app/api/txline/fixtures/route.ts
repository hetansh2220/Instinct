import { NextResponse } from "next/server";
import axios from "axios";

const apiBaseUrl = "https://txline-dev.txodds.com/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const jwt = request.headers.get("x-jwt");
    const apiToken = request.headers.get("x-api-token");
    if (!jwt || !apiToken) {
        return NextResponse.json({ error: "missing auth headers" }, { status: 400 });
    }
    try {
        const res = await axios.get(`${apiBaseUrl}/fixtures/snapshot`, {
            headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
        });
        return NextResponse.json({ fixtures: res.data });
    } catch (e) {
        const err = e as { message?: string; response?: { data?: unknown } };
        return NextResponse.json({ error: err.message, data: err.response?.data }, { status: 502 });
    }
}
