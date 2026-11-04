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


# 1. Install openssl and ca-certificates utilities
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# 2. Copy the password-protected .pfx file into the build context
COPY ./aspnetapp.pfx /src/aspnetapp.pfx

# 3. Extract the public certificate using the password and save it to the Linux trust store
RUN openssl pkcs12 -in /src/aspnetapp.pfx -clcerts -nokeys -out /usr/local/share/ca-certificates/devcert.crt -password pass:123Password

# 4. Update the Linux system certificate registry
RUN update-ca-certificates


# Instruct NuGet to automatically retry on network drops
ENV NUGET_ENABLE_RETRY_ON_FAILURE=true

ENV ASPNETCORE_HTTP_PORTS=5000
ENV ASPNETCORE_HTTPS_PORTS=5001
EXPOSE 5001
EXPOSE 5000

RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages \
	dotnet publish src/apps/blazor/ModularBlazor.Client/ModularBlazor.Client.csproj -c Release -o /out

FROM nginx:alpine AS final
COPY src/apps/blazor/ModularBlazor.Client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out/wwwroot /usr/share/nginx/html



# dotnet dev-certs https -ep "$env:USERPROFILE\.aspnet\https\clientapp.pfx" -p "YourSecurePassword123!"
# dotnet dev-certs https --trust
