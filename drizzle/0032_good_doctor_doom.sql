ALTER TABLE "messages" DROP CONSTRAINT "messages_related_purchase_id_purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_related_news_id_news_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "related_purchase_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "related_news_id";