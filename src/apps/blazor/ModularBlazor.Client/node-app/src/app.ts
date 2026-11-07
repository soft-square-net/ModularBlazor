
import { dbsInit } from './db' 
namespace ModularBlazor.Client {
  interface IModule { }
  export class Module implements IModule {

  }

  export function Init() {
    console.log("%cClient Module Initialized.", "color: green; font-weight: bold; font-size: 16px;");
    dbsInit(); // Initialize the database if it hasn't been initialized yet 
    return new Module();
  }
}

export default ModularBlazor.Client.Init;