import { createDbConnection } from "@mail0/db";

export const db = createDbConnection(process.env.DATABASE_URL!);
