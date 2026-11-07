// YourRclProject.lib.module.js

export function beforeStart(options, extensions) {
  console.log("RCL Loaded: Initializing Layouts.Admin.module/ JS modules...");

  // // Option A: If loading an ES module dynamically
  // import('./js/module.js').then(module => {
  //   /// TODO: replace the namespace with your own module name, 
  //   /// e.g., window.{ soft.square.net.Layouts.Admin }.module = module();
  //   window.soft.square.net.Layouts.Admin.module = module();
  // });

  // // Option B: If the module code is written straight in this initializer
  // window.myCustomJsInterop = {
  //   performAction: (data) => {
  //     return `Processed: ${data}`;
  //   }
  // };

  // window.myCustomJsInterop.performAction("Hello from Blazor");
}
