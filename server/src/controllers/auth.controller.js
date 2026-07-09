
const txline = process.env.TXLINE_ORIGIN

export async function guestStart(req, res) {
  try {
    console.log(txline)
    const r = await fetch(`${txline}/auth/guest/start`, { method: "POST" });
    const data = await r.json();
    if (!data.token) return res.status(502).json({ error: "no token from TxLINE", data });
    res.json({ token: data.token });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}