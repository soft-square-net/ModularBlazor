# ───── client ───── 
# Build context: the repository root (see src/Aspire/Host/Program.cs).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .

# The client modules (.dll / .nupkg) in wwwroot/modules come with the sources. Set BUILD_MODULES=true to rebuild
# them from modules/client/* inside the image (slower). Under Aspire the folder is also bind-mounted over the image's copy,
# so the modules you build locally with build-modules.* win either way.
ARG BUILD_MODULES=false
RUN if [ "$BUILD_MODULES" = "true" ]; then sed -i 's/\r$//' build-modules.sh && bash build-modules.sh Release; fi

# Force HTTP/1.1 to fix transport stream termination drops
ENV DOTNET_SYSTEM_NET_HTTP_SOCKETSHTTPHANDLER_HTTP2SUPPORT=false

# Extend the request timeout threshold to 5 minutes (default is 100s)
ENV DOTNET_HTTP_TIMEOUT=300

# Instruct NuGet to automatically retry on network drops
ENV NUGET_ENABLE_RETRY_ON_FAILURE=true

RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages \
	dotnet publish src/apps/blazor/ModularBlazor.Client/ModularBlazor.Client.csproj -c Release -o /out

FROM nginx:alpine AS final
# openssl: converts the mounted .pfx for the https server (see nginx/40-https.sh)
RUN apk add --no-cache openssl
COPY src/apps/blazor/ModularBlazor.Client/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY src/apps/blazor/ModularBlazor.Client/nginx/app.conf /etc/nginx/snippets/app.conf
COPY --chmod=755 src/apps/blazor/ModularBlazor.Client/nginx/40-https.sh /docker-entrypoint.d/40-https.sh
COPY --from=build /out/wwwroot /usr/share/nginx/html
EXPOSE 5000 5001

# Certificate: bind-mount a .pfx at /https/aspnetapp.pfx and set CERT_PASSWORD (Aspire does both).
# Create one with:  dotnet dev-certs https -ep aspnetapp.pfx -p <password>  and  dotnet dev-certs https --trust
