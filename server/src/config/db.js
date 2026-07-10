import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';

export const db = drizzle(process.env.DATABASE_URL, { schema });


export async function DbConnection() {
    if (!process.env.DATABASE_URL) {
        console.error(' DB not connected: DATABASE_URL is not set');
        return false;
    }
    try {
        await db.execute(sql`select 1`);
        console.log('DB connected');
        return true;
    } catch (e) {
        console.error('DB connection failed:', e.message);
        return false;
    }
}
