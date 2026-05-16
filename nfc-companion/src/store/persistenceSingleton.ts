import { createLocalStoragePersistence } from "@/storage/PersistenceLayer"

/** Single persistence instance shared by the store and diagnostics UI. */
export const persistence = createLocalStoragePersistence()
