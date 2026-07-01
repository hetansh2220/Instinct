import { NextResponse } from "next/server";
import axios from "axios";

const apiBaseUrl = "https://txline-dev.txodds.com/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const { txSig, walletSignature, leagues, jwt } = await request.json();
    try {
        const res = await axios.post(
            `${apiBaseUrl}/token/activate`,
            { txSig, walletSignature, leagues: leagues ?? [] },
            { headers: { Authorization: `Bearer ${jwt}` } }
        );
        return NextResponse.json({ token: res.data?.token ?? res.data }); // API token at .token
    } catch (e) {
        const err = e as { message?: string; response?: { data?: unknown } };
        return NextResponse.json({ error: err.message, data: err.response?.data }, { status: 502 });
    }
}
