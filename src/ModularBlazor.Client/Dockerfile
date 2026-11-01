# Build context: the repository root (see src/Aspire/Host/Program.cs).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
# Build the client modules (.dll / .nupkg) into wwwroot/modules, then publish the WebAssembly app.
RUN sed -i 's/\r$//' build-modules.sh && bash build-modules.sh Release
RUN dotnet publish src/ModularBlazor.Client/ModularBlazor.Client.csproj -c Release -o /out

FROM nginx:alpine AS final
COPY src/ModularBlazor.Client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out/wwwroot /usr/share/nginx/html
EXPOSE 80
