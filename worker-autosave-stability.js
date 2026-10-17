import baseWorker from './worker-track-size-guard.js';

const RENDER_AUTOSAVE = "function render(){\n  autosaveEditor();";
const RENDER_SAFE = "function render(){";

export default {
  async fetch(request, env, ctx) {
    const response = await baseWorker.fetch(request, env, ctx);
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;

    let html = await response.text();
    if (html.includes(RENDER_AUTOSAVE)) {
      html = html.replace(RENDER_AUTOSAVE, RENDER_SAFE);
    }

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
