/**
 * Expo CLI assigns fetch-nodeshim's URL to globalThis; on Node 22+ that export
 * can be undefined and breaks `new URL()` at startup. Keep native Node URL.
 */
const { URL, URLSearchParams } = require('node:url');

const originalAssign = Object.assign;

Object.assign = function assignWithUrlGuard(target, ...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    if ('URL' in source && source.URL == null) {
      source.URL = URL;
    }
    if ('URLSearchParams' in source && source.URLSearchParams == null) {
      source.URLSearchParams = URLSearchParams;
    }
  }
  return originalAssign(target, ...sources);
};
