import { uuidv7 } from 'uuidv7';

/**
 * Generate a UUID v7 (time-ordered UUID).
 * UUIDv7 encodes a Unix timestamp in the most-significant bits,
 * making it monotonically sortable and friendlier to B-tree indexes.
 */
export { uuidv7 };

/** Alias: generate a new UUID v7 */
export const generateId = uuidv7;
