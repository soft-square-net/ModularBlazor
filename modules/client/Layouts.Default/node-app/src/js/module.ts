// Default layout script -> wwwroot/js/module.js
//
// moduleHost (ModularBlazor.Client/wwwroot/moduleHost.js) imports this file from a blob URL when the layout
// module is activated, so it must stay a single self-contained file: MudTail and GSAP are bundled in.
//
// On activation it:
//   - applies the saved MudTail theme (palette, radius, dark mode) to <html>;
//   - starts the data-mud behaviours on <body>: every data-mud="…" / data-mud-reveal element that Blazor renders,
//     in this module or any other, gets its behaviour and loses it again when Blazor removes the element.
//
// The object returned by init() is what other modules get from
//   window.moduleHost.get('Layouts.Default')            (JS)
//   JS.InvokeAsync<IJSObjectReference>("moduleHost.get", "Layouts.Default")   (C#)
// It is MudTail's Blazor interop (create, behavior, observeTheme, toast, …), so modules share one runtime.
// On deactivation everything created through it is disposed.
import * as MudTail from 'mudtail/blazor';

interface ModuleContext {
  moduleId: string;
}

export default function init(ctx: ModuleContext) {
  MudTail.init({ autoInit: true });

  return {
    ...MudTail,
    moduleId: ctx.moduleId,
    dispose() {
      // Every handle created through the shared runtime (here or by other modules) belongs to this layout's
      // runtime, so it goes with it. Theme variables stay on <html>: the next layout keeps the user's theme.
      MudTail.dispose();
    },
  };
}
