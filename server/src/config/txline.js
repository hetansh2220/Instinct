const txline = process.env.TXLINE_ORIGIN;

/**
 * TxLINE credentials held by the SERVER.
 *
 * The live SSE feed is a long-lived connection that has to be owned by the server
 * (one stream per match, shared by everyone in the room), so the credentials can't
 * live only in a browser tab.
 *
 * The API token is a long-lived data licence — set TXLINE_API_TOKEN in .env. Until
 * that's set, we capture the token from the first activated user's request so the
 * app keeps working.
 *
 * The guest JWT is a short session token (30 days), fetched on demand and refreshed
 * before it expires. Refreshing needs no wallet, no signature and no SOL.
 */

let cachedJwt = null;
let jwtExpiry = 0;
let capturedApiToken = null;

const envApiToken = () => process.env.TXLINE_API_TOKEN || null;

/** Read `exp` out of a JWT without pulling in a JWT library. */
function expiryOf(jwt) {
    try {
        const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString("utf8"));
        return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
    } catch {
        return 0;
    }
}

async function guestJwt() {
    // Refresh a minute early rather than racing the expiry.
    if (cachedJwt && Date.now() < jwtExpiry - 60_000) return cachedJwt;

    const r = await fetch(`${txline}/auth/guest/start`, { method: "POST" });
    if (!r.ok) throw new Error(`TxLINE auth ${r.status}`);

    const { token } = await r.json();
    if (!token) throw new Error("TxLINE returned no guest token");

    cachedJwt = token;
    jwtExpiry = expiryOf(token) || Date.now() + 30 * 60_000;
    return cachedJwt;
}

/** Remember the API token an activated user sends, so the server can act alone. */
export function rememberApiToken(req) {
    const token = req?.headers?.["x-api-token"];
    if (token && !capturedApiToken && !envApiToken()) {
        capturedApiToken = token;
        console.log("[txline] captured an API token from a request — set TXLINE_API_TOKEN in .env to make it permanent");
    }
}

export const hasApiToken = () => !!(envApiToken() ?? capturedApiToken);

/** Upstream auth headers for any TxLINE call. */
export async function txlineHeaders(req) {
    if (req) rememberApiToken(req);

    const apiToken = envApiToken() ?? capturedApiToken;
    if (!apiToken) {
        throw new Error(
            "No TxLINE API token. Set TXLINE_API_TOKEN in server/.env, or activate once in the browser."
        );
    }

    return {
        Authorization: `Bearer ${await guestJwt()}`,
        "X-Api-Token": apiToken,
    };
}
