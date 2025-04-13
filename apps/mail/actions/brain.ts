'use server'
import { auth } from "@/lib/auth";
import { db } from "@zero/db";
import { connection } from "@zero/db/schema";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import axios from "axios";
import { getActiveConnection } from "./utils";

export const EnableBrain = async () => {
    if (!process.env.BRAIN_URL) {
        throw new Error('Brain URL not found');
    }

    const connection = await getActiveConnection()

    if (!connection?.accessToken || !connection.refreshToken) {
        throw new Error("Unauthorized, reconnect");
    }

    return await axios.put(process.env.BRAIN_URL + `/subscribe/${connection.providerId}`, {
        connectionId: connection.id,
    })
}
