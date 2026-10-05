import appWorker from './worker-find-plan.js';

function json(data,status=200){
  return new Response(JSON.stringify(data,null,2),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store'
    }
  });
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);

    if(url.pathname==='/api/diagnostic/environment'){
      const openaiKeyPresent=!!(env&&String(env.OPENAI_API_KEY||'').trim());
      const openaiModelPresent=!!(env&&String(env.OPENAI_MODEL||'').trim());
      return json({
        ok:true,
        diagnostic:'mancardo-preview-environment',
        hostname:url.hostname,
        pathname:url.pathname,
        openai_api_key_present:openaiKeyPresent,
        openai_model_present:openaiModelPresent,
        openai_model:openaiModelPresent?String(env.OPENAI_MODEL).trim():null,
        cf:{
          colo:request.cf&&request.cf.colo||null,
          country:request.cf&&request.cf.country||null
        },
        note:openaiKeyPresent
          ?'OPENAI_API_KEY is bound in this Worker environment.'
          :'OPENAI_API_KEY is NOT bound in this Worker environment.'
      });
    }

    return appWorker.fetch(request,env,ctx);
  }
};
