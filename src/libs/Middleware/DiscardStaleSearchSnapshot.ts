/**
 * Keeps an inline edit's new value on screen when an older Search response arrives. A response built before the edit holds
 * the server's old values, so applying its snapshot would flip the edited cell back. The edit marks those requests stale,
 * and this middleware drops their snapshot so `search()` can fetch them again.
 */
import {READ_COMMANDS} from '@libs/API/types';
import Log from '@libs/Log';

import ONYXKEYS from '@src/ONYXKEYS';

import type Middleware from './types';

/**
 * Queries of the Search requests whose response predates an inline edit. Keyed by `jsonQuery` rather than the hash because
 * the query includes the offset, so other pages of the same search keep their response.
 */
const staleSearchQueries = new Set<string>();

/** Queries of the stale requests whose snapshot was dropped, so `search()` knows to fetch them again. */
const droppedSearchQueries = new Set<string>();

/** Marks a Search request as stale, so its snapshot is dropped instead of overwriting an inline edit. */
function markSearchSnapshotStale(jsonQuery: string) {
    staleSearchQueries.add(jsonQuery);
}

/**
 * Forgets a Search request once its response was handled, and returns whether its snapshot was dropped. `search()` calls
 * it on success, error and cancel, so a request whose response never reached this middleware doesn't stay marked.
 */
function releaseSearchSnapshot(jsonQuery: string): boolean {
    staleSearchQueries.delete(jsonQuery);
    return droppedSearchQueries.delete(jsonQuery);
}

const discardStaleSearchSnapshot: Middleware = (requestResponse, request) =>
    requestResponse.then((response) => {
        const hash = request?.data?.hash;
        const jsonQuery = request?.data?.jsonQuery;
        if (request?.command !== READ_COMMANDS.SEARCH || typeof hash !== 'number' || typeof jsonQuery !== 'string' || !staleSearchQueries.has(jsonQuery) || !response?.onyxData) {
            return response;
        }

        staleSearchQueries.delete(jsonQuery);
        droppedSearchQueries.add(jsonQuery);
        const snapshotKey = `${ONYXKEYS.COLLECTION.SNAPSHOT}${hash}`;
        Log.info('[DiscardStaleSearchSnapshot] Dropping the snapshot of a Search response sent before an inline edit', false, {hash});
        return {...response, onyxData: response.onyxData.filter((update) => update.key !== snapshotKey)};
    });

export default discardStaleSearchSnapshot;
export {markSearchSnapshotStale, releaseSearchSnapshot};
