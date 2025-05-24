ALTER TABLE "mail0_user" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "mail0_user" ADD COLUMN "phone_number_verified" boolean DEFAULT false;