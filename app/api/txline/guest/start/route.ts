import { NextResponse } from "next/server";
import axios from "axios";

const apiOrigin = "https://txline-dev.txodds.com";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
    try {
        const res = await axios.post(`${apiOrigin}/auth/guest/start`);
        return NextResponse.json({ token: res.data?.token ?? null });
    } catch (e) {
        const err = e as { message?: string; response?: { data?: unknown } };
        return NextResponse.json(
            { error: err.message, data: err.response?.data },
            { status: 502 }
        );
    }
}
