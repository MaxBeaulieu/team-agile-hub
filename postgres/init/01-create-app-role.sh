#!/bin/sh
# Runs once, automatically, the first time the `postgres` container
# initializes an empty data volume (standard docker-entrypoint-initdb.d
# behaviour of the official postgres image — it does NOT re-run on restart
# of an existing volume).
#
# Creates the low-privilege role the backend actually connects as, per
# docs/architecture/selfhost-migration.md §4.1: "After the migration, the
# frontend has no database credential at all... the backend connects as a
# non-superuser role (`app`) that owns only the `public` schema." The
# `postgres` superuser (POSTGRES_USER/POSTGRES_PASSWORD) is used only by this
# script and by nothing else afterwards.
#
# APP_DB_USER / APP_DB_PASSWORD are passed in via docker-compose.yml's
# `environment:` block for this service (sourced from the root .env).
set -e

: "${APP_DB_USER:?APP_DB_USER must be set}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	DO \$\$
	BEGIN
	  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${APP_DB_USER}') THEN
	    CREATE ROLE "${APP_DB_USER}" LOGIN PASSWORD '${APP_DB_PASSWORD}';
	  END IF;
	END
	\$\$;

	-- EF Core's Database.Migrate() (Phase 3) needs to create/alter tables in
	-- `public` at backend startup, so the app role owns the schema outright
	-- rather than holding a narrower set of GRANTs that would need
	-- maintaining every time the schema changes.
	ALTER SCHEMA public OWNER TO "${APP_DB_USER}";
	GRANT ALL ON SCHEMA public TO "${APP_DB_USER}";
EOSQL
