using Carter;
using soft.square.net.WebApi.Modularity;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddCarter();
// Runtime modules: install (upload + manifest) -> activate (load + services + routes) -> deactivate / unload / uninstall.
builder.Services.AddRuntimeModules(builder.Configuration);

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapCarter();          // endpoints compiled into this app, including the module admin API
app.MapRuntimeModules();  // endpoints of modules activated at runtime

app.Run();
