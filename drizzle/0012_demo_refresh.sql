ALTER TABLE "occasions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "question_sets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "riddles" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;