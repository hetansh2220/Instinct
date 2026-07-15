
import {
    pgTable,
    uuid,
    varchar,
    text,
    timestamp,
    integer,
    boolean,
    index,
    unique,
    foreignKey,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
    id: uuid("id").defaultRandom().primaryKey(),
    wallet: varchar("wallet", { length: 44 }).notNull().unique(),
    username: varchar("username", { length: 32 }).unique(),
    bio: text("bio"),
    avatar: varchar("avatar", { length: 255 }),
    points: integer("points").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Chat messages. roomId is "match:<fixtureId>" — the fixture IS the room, so
 * there's no rooms table to keep in sync.
 */
export const messages = pgTable(
    "messages",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        roomId: varchar("room_id", { length: 64 }).notNull(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        body: varchar("body", { length: 500 }).notNull(),
        /** The message this one replies to, if any. */
        replyToId: uuid("reply_to_id"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
        // The only query we run: newest messages in a room.
        index("messages_room_created_idx").on(t.roomId, t.createdAt),
        // Self-reference. Deleting a quoted message nulls the pointer rather than
        // cascading — a reply is still a real message once its parent is gone.
        foreignKey({
            columns: [t.replyToId],
            foreignColumns: [t.id],
            name: "messages_reply_to_fk",
        }).onDelete("set null"),
    ]
);

/** A contest entry — one pick per user per fixture, locked at kickoff. */
export const entries = pgTable(
    "entries",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        fixtureId: integer("fixture_id").notNull(),
        pick: varchar("pick", { length: 8 }).notNull(), // home | draw | away
        points: integer("points").default(0).notNull(),
        settled: boolean("settled").default(false).notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [unique("entries_user_fixture_uniq").on(t.userId, t.fixtureId)]
);

/**
 * Rolling live Yes/No windows: "Will there be a goal|corner|card in the next 3 min?"
 * Resolved from TxLINE Clock.Seconds, not wall clock.
 */
export const predictionWindows = pgTable(
    "prediction_windows",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        fixtureId: integer("fixture_id").notNull(),
        eventType: varchar("event_type", { length: 16 }).notNull(), // goal | corner | card
        windowStartClock: integer("window_start_clock").notNull(),
        windowEndClock: integer("window_end_clock").notNull(),
        status: varchar("status", { length: 16 }).notNull().default("open"), // open | locked | resolved
        result: boolean("result"),
        resolvedAt: timestamp("resolved_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [index("prediction_windows_fixture_idx").on(t.fixtureId)]
);

/** One Yes/No guess per user per prediction window. */
export const predictions = pgTable(
    "predictions",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        fixtureId: integer("fixture_id").notNull(),
        windowId: uuid("window_id")
            .notNull()
            .references(() => predictionWindows.id, { onDelete: "cascade" }),
        guess: varchar("guess", { length: 8 }).notNull(), // yes | no
        isCorrect: boolean("is_correct"),
        pointsEarned: integer("points_earned").default(0).notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
        unique("predictions_user_window_uniq").on(t.userId, t.windowId),
        index("predictions_fixture_idx").on(t.fixtureId),
    ]
);
