CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"company_id" uuid,
	"name" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
