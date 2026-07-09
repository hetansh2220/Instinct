
const txline = process.env.TXLINE_ORIGIN

export async function activate(req, res) {
  const { txSig, walletSignature, leagues, jwt } = req.body;
  try {
    const r = await fetch(`${txline}/api/token/activate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ txSig, walletSignature, leagues: leagues ?? [] }),
    });
    const data = await r.json();
    if (!data.token) return res.status(502).json({ error: "no token from TxLINE", data });
    res.json({ token: data.token });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}