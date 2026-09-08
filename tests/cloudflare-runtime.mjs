import { registerHooks } from 'node:module';
const moduleURL='data:text/javascript,'+encodeURIComponent('export const env = globalThis.__threadformTestEnv ?? {};');
registerHooks({resolve(specifier,context,nextResolve){if(specifier==='cloudflare:workers')return {url:moduleURL,shortCircuit:true};return nextResolve(specifier,context);}});
