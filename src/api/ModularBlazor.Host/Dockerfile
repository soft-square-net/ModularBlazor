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


RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages \ 
	dotnet publish src/api/ModularBlazor.Host/ModularBlazor.Host.csproj -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /out .

ENV ASPNETCORE_HTTP_PORTS=5100
ENV ASPNETCORE_HTTPS_PORTS=5101
# These belong in the final stage: ENV set in the build stage does not reach the running image (it would listen on 8080).
# Kestrel's https certificate is not baked into the image: Aspire mounts a .pfx at /https/aspnetapp.pfx and sets
# Kestrel__Certificates__Default__Path / __Password (see src/Aspire/Host/Program.cs).
EXPOSE 5100
EXPOSE 5101

ENTRYPOINT ["dotnet", "soft.square.net.ModularBlazor.Host.dll"]



