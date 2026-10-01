// Accounts and one-time login codes behind the email-code sign-in flow.
//
// `users.id` is the app's user id: the pre-auth install keeps its original
// `local-user` identity (and with it every source, subscription and post it
// already owns), while new sign-ups get a generated `usr_…` id. Tiers are
// 'free' | 'pro' | 'mega-pro' | 'admin'; 'admin' has no account limit and an
// instant feed.

import {
  pgTable,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    tier: text("tier").notNull().default("free"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("user_email_idx").on(t.email)],
);

export const authCodes = pgTable(
  "auth_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    // HMAC-SHA256 of the code keyed with AUTH_SECRET, so a leaked row is not a
    // working code.
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("auth_codes_email_idx").on(t.email)],
);
