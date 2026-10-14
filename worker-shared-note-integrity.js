import baseWorker from './worker-shared-note-autosync.js';

// Hotfix: keep Shared Library publish requests untouched.
// Note decoration/replication remains handled by the underlying Shared-note worker.
export default {
  async fetch(request, env, ctx) {
    return baseWorker.fetch(request, env, ctx);
  }
};
