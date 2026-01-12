import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * User roles in the system
 * - resident: Regular resident of the housing complex
 * - board_member: Member of the student committee/board
 * - admin: Administrator with full access
 */
export type UserRole = "resident" | "board_member" | "admin";

/**
 * Users table schema
 * Stores authenticated user information
 */
export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	email: text("email").notNull().unique(),
	name: text("name").notNull(),
	role: text("role").$type<UserRole>().notNull().default("resident"),
	apartmentNumber: text("apartment_number"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
