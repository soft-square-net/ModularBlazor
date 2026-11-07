// Blazor JS initializer ({assembly}.lib.module.js).
//
// Blazor only runs this for an RCL the host references at BUILD time. Modules the app downloads at runtime never
// get it, so the module manager runs js/module.js itself when the module is activated (see moduleHost.js).
// This file only covers the build-time-reference case, and steps aside when the module manager already did the job.
export async function afterStarted() {
  if (window.moduleHost?.isActive('ModularBlazor.Client')) return;

  const mod = await import('./js/app.js');
  if (typeof mod.default === 'function') await mod.default({ moduleId: 'ModularBlazor.Client' });
}
