import { db } from "../config/db.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const avatarUrl = (seed) =>
  `https://api.dicebear.com/10.x/glyphs/svg?seed=${encodeURIComponent(seed || "guest")}`;


export async function getUser(req, res) {
  try {
    const rows = await db.select().from(users).where(eq(users.wallet, req.params.wallet)).limit(1);
    if (!rows.length) return res.status(404).json({ error: "not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}


export async function upsertUser(req, res) {
  const { wallet, username, bio, avatar } = req.body ?? {};
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  const finalAvatar = avatar || avatarUrl(wallet);
  const values = {
    wallet,
    username: username ?? null,
    bio: bio ?? null,
    avatar: finalAvatar,
  };

  try {
    const rows = await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: users.wallet,
        set: { username: values.username, bio: values.bio, avatar: finalAvatar, updatedAt: new Date() },
      })
      .returning();
    res.json(rows[0]);
  } catch (e) {
    // unique username collision
    if (e?.code === "23505" || /unique/i.test(String(e?.message))) {
      return res.status(409).json({ error: "username already taken" });
    }
    res.status(500).json({ error: e.message });
  }
}
