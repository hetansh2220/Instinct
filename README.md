# Instinct

**Predict live. Beat the room.**

Live football prediction contests on Solana. Pick a winner before kickoff, watch the
match unfold with everyone else in the room, and climb the leaderboard when you call it
right.

Built on the [TxLINE](https://txline.txodds.com) on-chain sports oracle by TxODDS.

---

## The loop

| Stage | What happens |
|---|---|
| **Upcoming** | Join a contest by picking Home / Draw / Away. Entries **lock at kickoff**. |
| **Live** | Chat in the match room — presence, replies, emoji, GIFs. |
| **Full time** | The contest **settles automatically** from the final score. A correct call is worth **15 points**. |
| **After** | Match timeline, team stats, per-match leaderboard, and an all-time global ranking. |

---

## Architecture

```
┌──────────────┐       REST + WebSocket        ┌──────────────┐       REST      ┌─────────┐
│  web         │ ────────────────────────────► │  server      │ ──────────────► │ TxLINE  │
│  Next.js 16  │ ◄──────────────────────────── │  Express     │ ◄────────────── │ oracle  │
└──────┬───────┘          Socket.IO            └──────┬───────┘                 └─────────┘
       │                                              │
       │ wallet-adapter                               │ Drizzle
       ▼                                              ▼
┌──────────────┐                               ┌──────────────┐
│    Solana    │                               │     Neon     │
│   (devnet)   │                               │   Postgres   │
└──────────────┘                               └──────────────┘
```

The browser never talks to TxLINE directly — every call is proxied by the server, which
also settles contests, so a result can't be forged by a client.

| | |
|---|---|
| **Frontend** | Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui, TanStack Query |
| **Realtime** | Socket.IO |
| **Backend** | Node + Express (ESM) |
| **Database** | Neon serverless Postgres + Drizzle ORM |
| **Chain** | Solana devnet — wallet-adapter, Anchor, SPL Token-2022 |
| **Data** | TxLINE oracle — fixtures, scores, historical match events |

---

## Getting started

**Prerequisites** — Node 20+, pnpm, a [Neon](https://neon.tech) database, and a Solana
wallet with devnet SOL.

**1. Backend**

```bash
cd server
npm install
cp .env.example .env     # fill it in — see Environment below
npx drizzle-kit push     # create the tables
npm run dev              # http://localhost:8080
```

**2. Frontend**

```bash
cd web
pnpm install
pnpm dev                 # http://localhost:3000
```

**3. Activate**

Connect a wallet in the app. Activation runs automatically: it sends an on-chain
`subscribe` transaction, signs a message, and exchanges both for a TxLINE API token.

> [!IMPORTANT]
> Activation is a real transaction, so **the wallet needs devnet SOL** —
> `solana airdrop 2 <ADDRESS> --url devnet`. Without it, activation fails and no match
> data loads.

---

## Environment

**`server/.env`**

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `TXLINE_ORIGIN` | `https://txline-dev.txodds.com` |
| `FRONTEND_ORIGIN` | `http://localhost:3000` — CORS and Socket.IO origin |

**`web/.env.local`**

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend URL. Defaults to `http://localhost:8080`. |
| `NEXT_PUBLIC_GIPHY_API_KEY` | Optional. Without it, the GIF button is hidden. |

---

## API

### REST

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/auth/guest/start` | TxLINE guest session token |
| `POST` | `/api/token/activate` | Exchange a subscribe tx + signature for an API token |
| `GET` | `/api/fixtures/snapshot` | Fixtures, optionally by day or competition |
| `GET` | `/api/scores/historical/:fixtureId` | Full event stream for a finished match |
| `POST` | `/api/scores/final` | Batch final scores, computed server-side |
| `GET` `POST` | `/api/users/:wallet` · `/api/users` | Profile read / upsert |
| `GET` | `/api/rooms/:fixtureId/messages` | Chat history |
| `GET` | `/api/rooms/:fixtureId/members` | Everyone in the contest, with their picks |
| `GET` `POST` | `/api/entries` · `/api/entries/:fixtureId` | Contest entries |
| `POST` | `/api/contests/:fixtureId/settle` | Settle a finished contest — idempotent |
| `GET` | `/api/leaderboard` | All-time standings |

### Socket.IO

The handshake carries `{ wallet }`, which the server resolves to a user. Every message is
attributed from that server-side identity, never from the client's payload.

| Direction | Event | Payload |
|---|---|---|
| → | `room:join` · `room:leave` | `{ fixtureId }` |
| → | `message:send` | `{ body, clientId, replyTo? }` |
| ← | `message:new` | the saved message, with any quoted parent inline |
| ← | `room:members` | the full member list, each with pick + online flag |
| ← | `message:rejected` | `{ clientId, reason }` |

---

## Data model

```
users      id · wallet · username · bio · avatar · points
messages   id · roomId ("match:<fixtureId>") · userId · body · replyToId → messages.id
entries    id · userId · fixtureId · pick · points · settled    UNIQUE (userId, fixtureId)
```

A room **is** a fixture, so there is no `rooms` table to keep in sync. Membership lives in
`entries` and is therefore durable — leaving the page doesn't remove you from a room;
presence only decides whether your dot is green.

---

## Notes on the design

Several decisions here were forced by the shape of the data, and are worth understanding
before changing them.

**Entries lock at kickoff, enforced server-side.** Otherwise you could back a team that is
already winning. A client-side check is not a check.

**Settlement reads the final score from the historical feed, never from live events.** The
feed *retracts* events — `action_discarded`, `action_amend`, a goal ruled out by VAR — so
paying out the moment a goal arrives would award points for goals that never counted. The
historical feed is only published once a match is over, so it is already corrected.

**Goals are counted from `Action: "goal"` events, not the `Stats` counters.** The counters
proved unreliable: they reported a 2–3 win as a 0–0 draw.

**The feed re-emits each event as it learns more about it.** A goal first arrives with an
empty `Data`, and the scorer's `PlayerId` only appears in a *later* copy at the same clock.
Events must be collected and enriched across re-emissions, then deduped by
`(action, clock, participant)` — in one match, **11 raw emissions were 5 real goals**.

**Only Giphy and Tenor URLs render as images in chat.** A GIF travels as a plain message
whose body is its URL, so anything URL-shaped would otherwise render as an `<img>` —
letting anyone embed an arbitrary image, or a tracking pixel, just by typing a link.

**Settlement is lazy and idempotent.** The first person to open a finished match pays
everyone out. The write is guarded on `settled = false`, so concurrent callers cannot
double-pay. No cron, no job queue.

---

## Known limitations

- **Socket auth trusts the claimed wallet.** The handshake resolves `{ wallet }` to a user
  without proving ownership of it. The fix is a signed nonce verified with `tweetnacl`.
- **The TxLINE guest JWT expires after 30 days** and there is no refresh path, so
  credentials eventually go stale.
- **Every user must activate on-chain**, which costs devnet SOL — a visitor with an
  unfunded wallet cannot load match data.

---

## Roadmap

- **Live micro-predictions** during a match ("what happens next?"), scored from the live
  event stream
- **Replay mode** — stream a recorded match through the same pipeline, so the live loop is
  demoable without a live fixture
- **On-chain settlement** via TxLINE's `validateStat()` oracle, so results are verified on
  chain rather than trusted from a REST call
