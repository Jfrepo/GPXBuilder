import baseWorker from './worker-track-size-guard.js';

const RENDER_AUTOSAVE = "function render(){\n  autosaveEditor();";
const RENDER_SAFE = "function render(){";
const LEGACY_TRACK_SYNC = /<script id="mancardo-private-delete-tombstone-fix">[\s\S]*?<\/script>/i;
const LEGACY_WAYPOINT_SYNC = /<script id="mancardo-private-waypoint-sync">[\s\S]*?<\/script>/i;

export default {
  async fetch(request, env, ctx) {
    const response = await baseWorker.fetch(request, env, ctx);
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;

    let html = await response.text();

    // Rendering must stay side-effect free. Autosave is triggered only by
    // actual edit/save actions, never by map/UI redraws.
    if (html.includes(RENDER_AUTOSAVE)) {
      html = html.replace(RENDER_AUTOSAVE, RENDER_SAFE);
    }

    // Disable the superseded canonical polling clients. Both legacy clients
    // poll every 5 seconds, run again after ordinary clicks/focus, and call
    // location.reload() when they reconcile changes. That can create a
    // continuous reload/reconcile loop alongside the newer revision-aware
    // private sync client. The server APIs remain available; only these old
    // browser-side polling scripts are removed.
    html = html.replace(LEGACY_TRACK_SYNC, '');
    html = html.replace(LEGACY_WAYPOINT_SYNC, '');

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control', 'no-store, max-age=0');
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
