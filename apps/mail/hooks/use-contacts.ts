import { useEffect, useState } from "react"
import { dexieStorageProvider } from "@/lib/idb"
import { Sender } from "@/types"
import useSWRImmutable from "swr/immutable"
import { useSession } from "@/lib/auth-client"

export const useContacts = () => {
    const { data: session } = useSession()
    const { mutate, data } = useSWRImmutable<Sender[]>(['contacts', session?.connectionId])

    useEffect(() => {
        const provider = dexieStorageProvider()
        provider.list('$').then((cachedThreadsResponses) => {
            const seen = new Set<string>();
            const contacts: Sender[] = cachedThreadsResponses.reduce((acc: Sender[], { state }) => {
                if (state.data) {
                    for (const thread of state.data[0].threads) {
                        const email = thread.sender.email;
                        if (!seen.has(email)) {
                            seen.add(email);
                            acc.push(thread.sender);
                        }
                    }
                }
                return acc;
            }, []);
            mutate(contacts)
        })
    }, [])

    return data
}