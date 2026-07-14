-- Local development login only. Managed environments should provision their own
-- least-privilege login and grant it membership in etsy_app.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'etsy_app') THEN
    CREATE ROLE etsy_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app LOGIN PASSWORD 'app';
    GRANT etsy_app TO app;
  END IF;
END $$;

