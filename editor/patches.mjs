// Text patches applied to CapCut's JS as the local server serves it (hot-reloaded).
// Each patch must match exactly once; mismatches are logged so CapCut updates are noticed.
// Keep patches minimal and documented: diagnostics, offline wiring, never paywall bypass.
// Patch output goes to window.__patchLog (their runtime swallows console output).
const PL = '(self.__patchLog=self.__patchLog||[]).push';
const fmt = (expr) => `${PL}(JSON.stringify(${expr},(k,v)=>typeof v==="bigint"?String(v):v instanceof Error?{message:v.message,stack:String(v.stack).slice(0,1500)}:v).slice(0,4000))`;

const CDN_PUBLIC = '"//sf16-web-login-neutral.capcutstatic.com/obj/capcut-web-login-static/ies/lvweb/video_online/"';
const LOCAL_PUBLIC = '"/static-resource/ies/lvweb/video_online/"';

export const patches = [
  ...(process.env.TOAST_TRACE ? [{
    file: /static\/js\/.*\.js$/, all: true,
    why: 'diagnostics (TOAST_TRACE=1 only): stack of every "Something went wrong" toast',
    find: '"network_unavailable__please_try_again_later",{}',
    replace: `"network_unavailable__please_try_again_later",(Error.stackTraceLimit=40,${PL}(["toastsrc",String(new Error().stack).slice(0,4000)]),{})`,
  }, {
    file: /async\/6087\.986c970484\.js$/,
    why: 'diagnostics (TOAST_TRACE=1 only): which recommend feed failed',
    find: 'let r=await this._options.fetchRecommendData(e,t);',
    replace: `let r=await this._options.fetchRecommendData(e,t);r.ok||${fmt('["recommendFail",r,String(this._options.fetchRecommendData).slice(0,600)]')};`,
  }, {
    file: /upload\/locales\/en\.[0-9a-f]+\.js$/, all: true,
    why: 'diagnostics (TOAST_TRACE=1 only): tag each "went wrong" locale string with its key',
    find: /(\w+):"([^"]*went wrong[^"]*)"/g, replace: '$1:"$2 [$1]"',
  }] : []),
  {
    file: /js\/widget-0f5d9be9\.e676d2fa37\.js$/,
    why: 'diagnostics: effect ensure success/failure',
    find: 'onSuccess:function(){for(var e=arguments.length,t=Array(e),i=0;i<e;i++)t[i]=arguments[i];return console.info("[ensure] ensure effect success",t)},onError:function(){for(var e=arguments.length,t=Array(e),i=0;i<e;i++)t[i]=arguments[i];return console.error("[ensure] ensure effect error",t)}',
    replace: `onSuccess:function(){var t=[].slice.call(arguments);${fmt('["ensureOK",t]')}},onError:function(){var t=[].slice.call(arguments);${fmt('["ensureERR",t]')}}`,
  },
  {
    file: /js\/widget-0f5d9be9\.e676d2fa37\.js$/,
    why: 'diagnostics: trace ensureEffect entry',
    find: 'ensureEffect(e,t){let i=arguments.length>2',
    replace: `ensureEffect(e,t){${fmt('["ensureEffect:start",e&&e.key,e&&e.resource&&e.resource.type,t]')};let i=arguments.length>2`,
  },
  {
    file: /js\/widget-0f5d9be9\.e676d2fa37\.js$/,
    why: 'diagnostics: trace resource metadata lookups',
    find: 'getFullResource(e,t){let i=t.type;',
    replace: `getFullResource(e,t){let i=t.type;${fmt('["getFullResource",e,i]')};`,
  },
  {
    file: /js\/widget-0f5d9be9\.e676d2fa37\.js$/,
    why: 'diagnostics: trace resource value download result',
    find: 'console.log("[ensure] resource loaded",i.resource.type,o,l,u),',
    replace: `${fmt('["resourceLoaded",i.key,i.resource.type]')},`,
  },
  {
    file: /js\/widget-0f5d9be9\.e676d2fa37\.js$/,
    why: 'diagnostics: trace ensure failures',
    find: 'D=e=>(console.error("[ensure] failed to ensure",i,e),',
    replace: `D=e=>(${fmt('["ensureFailed",i&&i.key,e]')},`,
  },
  {
    file: /js\/runtime\.c7d25f3b56\.js$/,
    why: 'offline wiring: webpack publicPath -> same-origin mirror (workers must be same-origin)',
    find: CDN_PUBLIC,
    replace: LOCAL_PUBLIC,
  },
  {
    file: /sidecode\/__sidecode_runtime__\.2a8c30fb12\.js$/,
    why: 'offline wiring: sidecode publicPath -> same-origin mirror',
    find: CDN_PUBLIC,
    replace: LOCAL_PUBLIC,
  },
  {
    file: /js\/editor\.283da402a1\.js$/,
    why: 'diagnostics: surface editor init failures (their reporter only sends to telemetry)',
    find: 'reportEditorInitError(e,t){',
    replace: `reportEditorInitError(e,t){${fmt('["initError",e,t]')};`,
  },
  {
    file: /js\/editor\.283da402a1\.js$/,
    why: 'diagnostics: log every handled lifecycle error with its cause',
    find: 'handleError(e){let t=!(arguments.length>1)',
    replace: `handleError(e){${fmt('["handleError",e&&e.code,e&&e.msg,e&&e.cause]')};let t=!(arguments.length>1)`,
  },
];
