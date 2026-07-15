import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';

export const db = drizzle(process.env.DATABASE_URL, { schema });


/** Ensure Phase-2 prediction tables exist (idempotent). */
async function ensurePredictionTables() {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS prediction_windows (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            fixture_id integer NOT NULL,
            event_type varchar(16) NOT NULL,
            window_start_clock integer NOT NULL,
            window_end_clock integer NOT NULL,
            status varchar(16) DEFAULT 'open' NOT NULL,
            result boolean,
            resolved_at timestamp,
            created_at timestamp DEFAULT now() NOT NULL
        )
    `);
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS predictions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
            fixture_id integer NOT NULL,
            window_id uuid NOT NULL REFERENCES prediction_windows(id) ON DELETE cascade,
            guess varchar(8) NOT NULL,
            is_correct boolean,
            points_earned integer DEFAULT 0 NOT NULL,
            created_at timestamp DEFAULT now() NOT NULL
        )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS prediction_windows_fixture_idx ON prediction_windows (fixture_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS predictions_fixture_idx ON predictions (fixture_id)`);
    await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS predictions_user_window_uniq ON predictions (user_id, window_id)
    `);
}

export async function DbConnection() {
    if (!process.env.DATABASE_URL) {
        console.error(' DB not connected: DATABASE_URL is not set');
        return false;
    }
    try {
        await db.execute(sql`select 1`);
        await ensurePredictionTables();
        console.log('DB connected');
        return true;
    } catch (e) {
        console.error('DB connection failed:', e.message);
        return false;
    }
}
