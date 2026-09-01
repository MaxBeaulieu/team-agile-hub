# Multi-stage build for the ASP.NET Core / .NET 10 backend — used by
# docker-compose.yml's `backend` service (SELFHOST_MIGRATION_PLAN.md Phase 6).
#
# The `aspnet:10.0` base image already runs as the non-root `app` user and
# listens on port 8080 by default (ASPNETCORE_HTTP_PORTS) as of .NET 8+;
# docker-compose.yml sets ASPNETCORE_HTTP_PORTS=8080 explicitly anyway.
#
# Healthcheck note (docker-compose.yml has the full explanation): the
# eventual liveness probe is GET /api/health (docs/architecture/
# selfhost-migration.md §1.9), which doesn't exist in code yet. Until then,
# compose uses a bare TCP-accept check instead — this base image ships with
# neither `curl` nor `wget`, so if you swap to an HTTP-based check later,
# add `curl` in the `final` stage below (small, and you'll want it anyway).
# When /api/health does land, point the healthcheck at it specifically, NOT
# /api/health/ready — the readiness endpoint does a DB round-trip, so using
# it as the container healthcheck would mark an otherwise-healthy backend
# unhealthy on a transient DB blip.
#
# Base-image caveat for later: this only works on Debian-based tags (the
# default `10.0` tag). If this ever moves to a `-noble-chiseled` variant
# (plausible under Phase 6's "host hardening" work) there is no shell, no
# package manager, and no curl — both the TCP builtin and an added curl stop
# being options. That combination needs `HEALTHCHECK NONE` plus an external
# probe, or the app self-reporting some other way; it isn't a drop-in swap.

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["backend.csproj", "./"]
RUN dotnet restore
COPY . .
RUN dotnet build -c Release -o /app/build

FROM build AS publish
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "backend.dll"]
