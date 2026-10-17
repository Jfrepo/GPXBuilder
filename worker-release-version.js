import baseWorker from './worker-shared-stale-link-recovery.js';

const RELEASE_VERSION='v2026.10.17.1';
const RELEASE_SOURCE='1f28a23';
const RELEASE_STYLE=String.raw`<style id="mancardo-release-version-style">
#mancardoReleaseVersion{display:inline-flex;align-items:center;margin-left:.18rem;padding:.16rem .38rem;border:1px solid var(--border);border-radius:999px;background:var(--surface-2);color:var(--text-muted);font:600 .62rem/1 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.02em;white-space:nowrap}
@media(max-width:700px){#mancardoReleaseVersion{font-size:.56rem;padding:.14rem .3rem}}
</style>`;

function injectReleaseVersion(html){
  if(html.includes('id="mancardoReleaseVersion"'))return html;
  const badge=`<span id="mancardoReleaseVersion" title="Release ${RELEASE_VERSION} · source ${RELEASE_SOURCE}">${RELEASE_VERSION}</span>`;
  html=html.replace(/(<span class="name disp">ManCardo<\/span>)/,`$1${badge}`);
  const headEnd=html.toLowerCase().lastIndexOf('</head>');
  return headEnd>=0?html.slice(0,headEnd)+RELEASE_STYLE+'\n'+html.slice(headEnd):RELEASE_STYLE+html;
}

export default {
  async fetch(request,env,ctx){
    const response=await baseWorker.fetch(request,env,ctx);
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    const html=injectReleaseVersion(await response.text());
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
