namespace ModularBlazor.Layouts.Admin {
  interface IModule { }
  export class Module implements IModule {

  }

  export function Init() {
    console.log("Core initialized.");
    return new Module();
  }
}

export default ModularBlazor.Layouts.Admin.Init;