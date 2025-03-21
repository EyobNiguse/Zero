import { pgTableCreator, text, timestamp, boolean, integer, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

export const createTable = pgTableCreator((name) => `mail0_${name}`);

export const user = createTable('user', {
  id: uuid().primaryKey().$defaultFn(uuidv7),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull(),
  image: text(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
  defaultConnectionId: text(),
});

export const session = createTable('session', {
  id: uuid().primaryKey().$defaultFn(uuidv7),
  expiresAt: timestamp().notNull(),
  token: text().notNull().unique(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
  ipAddress: text(),
  userAgent: text(),
  userId: text()
    .notNull()
    .references(() => user.id),
});

export const account = createTable('account', {
  id: uuid().primaryKey().$defaultFn(uuidv7),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp(),
  refreshTokenExpiresAt: timestamp(),
  scope: text(),
  password: text(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
});

export const verification = createTable('verification', {
  id: uuid().primaryKey().$defaultFn(uuidv7),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp().notNull(),
  createdAt: timestamp(),
  updatedAt: timestamp(),
});

export const earlyAccess = createTable('early_access', {
  id: uuid().primaryKey().$defaultFn(uuidv7),
  email: text().notNull().unique(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
});

export const connection = createTable('connection', {
  id: uuid().primaryKey().$defaultFn(uuidv7),
  userId: text()
    .notNull()
    .references(() => user.id),
  email: text().notNull().unique(),
  name: text(),
  picture: text(),
  accessToken: text().notNull(),
  refreshToken: text(),
  scope: text().notNull(),
  providerId: text().notNull(),
  expiresAt: timestamp().notNull(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
});

export const summary = createTable('summary', {
  messageId: text().primaryKey(),
  content: text().notNull(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
  connectionId: text().notNull(),
  saved: boolean().notNull().default(false),
  tags: text(),
  suggestedReply: text(),
});

export const note = createTable('note', {
  id: uuid().primaryKey().$defaultFn(uuidv7),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  threadId: text().notNull(),
  content: text().notNull(),
  color: text().notNull().default('default'),
  isPinned: boolean().default(false),
  order: integer().notNull().default(0),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});
