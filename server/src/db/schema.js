
import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
    id: uuid("id").defaultRandom().primaryKey(),
    wallet: varchar("wallet", { length: 44 }).notNull().unique(),
    username: varchar("username", { length: 32 }).unique(),
    bio: text("bio"),
    avatar: varchar("avatar", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
