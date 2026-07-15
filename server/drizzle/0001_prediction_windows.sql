CREATE TABLE IF NOT EXISTS "prediction_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_id" integer NOT NULL,
	"event_type" varchar(16) NOT NULL,
	"window_start_clock" integer NOT NULL,
	"window_end_clock" integer NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"result" boolean,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fixture_id" integer NOT NULL,
	"window_id" uuid NOT NULL,
	"guess" varchar(8) NOT NULL,
	"is_correct" boolean,
	"points_earned" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "predictions" ADD CONSTRAINT "predictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "predictions" ADD CONSTRAINT "predictions_window_id_prediction_windows_id_fk" FOREIGN KEY ("window_id") REFERENCES "public"."prediction_windows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "prediction_windows_fixture_idx" ON "prediction_windows" ("fixture_id");
CREATE INDEX IF NOT EXISTS "predictions_fixture_idx" ON "predictions" ("fixture_id");
CREATE UNIQUE INDEX IF NOT EXISTS "predictions_user_window_uniq" ON "predictions" ("user_id","window_id");
