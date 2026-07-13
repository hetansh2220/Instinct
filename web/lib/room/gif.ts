/**
 * A GIF travels as a plain message whose body is its URL (no schema change), so
 * anything URL-shaped would otherwise render as an image. Only the GIF providers
 * are trusted — otherwise a user could embed an arbitrary image, or a tracking
 * pixel, into the room just by typing a link.
 *
 * Giphy serves from media0-4.giphy.com, so the check is on the registrable domain
 * rather than an exact host.
 */
const GIF_HOSTS = /(^|\.)(giphy\.com|tenor\.com)$/;

export function gifUrl(body: string): string | null {
    try {
        const url = new URL(body.trim());
        const ok = url.protocol === "https:" && GIF_HOSTS.test(url.hostname);
        return ok ? url.href : null;
    } catch {
        return null;
    }
}

/** What to show when a GIF is quoted — nobody wants to read a 150-char URL. */
export const previewOf = (body: string) => (gifUrl(body) ? "GIF" : body);
