# ───── host-api ───── 
# Build context: the repository root (see src/Aspire/Host/Program.cs).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .

# Force HTTP/1.1 to fix transport stream termination drops
ENV DOTNET_SYSTEM_NET_HTTP_SOCKETSHTTPHANDLER_HTTP2SUPPORT=false

# Extend the request timeout threshold to 5 minutes (default is 100s)
ENV DOTNET_HTTP_TIMEOUT=300

# Instruct NuGet to automatically retry on network drops
ENV NUGET_ENABLE_RETRY_ON_FAILURE=true


# 1. Install openssl and ca-certificates utilities
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# 2. Copy the password-protected .pfx file into the build context
COPY src/api/ModularBlazor.Host/aspnetapp.pfx /src/aspnetapp.pfx

# 3. Extract the public certificate using the password and save it to the Linux trust store
RUN openssl pkcs12 -in /src/aspnetapp.pfx -clcerts -nokeys -out /usr/local/share/ca-certificates/devcert.crt -password pass:123Password

# 4. Update the Linux system certificate registry
RUN update-ca-certificates


ENV ASPNETCORE_HTTP_PORTS=5100
ENV ASPNETCORE_HTTPS_PORTS=5101
EXPOSE 5100
EXPOSE 5101

RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages \ 
	dotnet publish src/api/ModularBlazor.Host/ModularBlazor.Host.csproj -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /out .

ENTRYPOINT ["dotnet", "soft.square.net.ModularBlazor.Host.dll"]



