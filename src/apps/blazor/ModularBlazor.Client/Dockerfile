# Build context: the repository root (see src/Aspire/Host/Program.cs).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR ../../src
COPY . .
# Build the client modules (.dll / .nupkg) into wwwroot/modules, then publish the WebAssembly app.
# RUN sed -i 's/\r$//' build-modules.sh && bash build-modules.sh Release


# Force HTTP/1.1 to fix transport stream termination drops
ENV DOTNET_SYSTEM_NET_HTTP_SOCKETSHTTPHANDLER_HTTP2SUPPORT=false

# Extend the request timeout threshold to 5 minutes (default is 100s)
ENV DOTNET_HTTP_TIMEOUT=300

# Instruct NuGet to automatically retry on network drops
ENV NUGET_ENABLE_RETRY_ON_FAILURE=true

RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages \ 
	dotnet publish src/apps/blazor/ModularBlazor.Client/ModularBlazor.Client.csproj -c Release -o /out

FROM nginx:alpine AS final
COPY src/apps/blazor/ModularBlazor.Client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out/wwwroot /usr/share/nginx/html
EXPOSE 80
