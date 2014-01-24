-- Spatial extensions
CREATE EXTENSION postgis;
CREATE EXTENSION postgis_topology;

--DROP TABLE reports;
CREATE TABLE reports(
	pkey bigint NOT NULL,
	created_at timestamp with time zone,
	source char(7),
	text character varying,
	CONSTRAINT pkey_reports PRIMARY KEY (pkey)
);

-- Add Geometry column to reports
SELECT AddGeometryColumn ('public','reports','the_geom',4326,'POINT',2);

-- Function: update_reports()
-- DROP FUNCTION update_reports();

CREATE OR REPLACE FUNCTION update_reports()
  RETURNS trigger AS
$BODY$
	BEGIN
		IF (TG_OP = 'UPDATE') THEN
			IF (TG_TABLE_NAME = 'tweet_reports') THEN
				INSERT INTO reports SELECT NEW.pkey, NEW.created_at, 'Twitter', NEW.text, NEW.the_geom;
				RETURN NEW;
			ELSIF (TG_TABLE_NAME = 'web_reports') THEN
				INSERT INTO reports SELECT NEW.pkey, NEW.created_at, 'Web', NEW.text, NEW.the_geom;
				RETURN NEW;
			END IF;
		ELSIF (TG_OP = 'INSERT') THEN
			IF (TG_TABLE_NAME = 'tweet_reports') THEN
				INSERT INTO reports SELECT NEW.pkey, NEW.created_at, 'Twitter', NEW.text, NEW.the_geom;
				RETURN NEW;
			ELSIF (TG_TABLE_NAME = 'web_reports') THEN
				INSERT INTO reports SELECT NEW.pkey, NEW.created_at, 'Web', NEW.text, NEW.the_geom;
				RETURN NEW;
			END IF;
		END IF;
	END;
$BODY$
  LANGUAGE plpgsql VOLATILE
  COST 100;
ALTER FUNCTION update_reports()
  OWNER TO postgres;

CREATE SEQUENCE report_key;

-- Table: tweet_reorts
-- DROP TABLE tweet_reports;

CREATE TABLE tweet_reports
(
  pkey bigint NOT NULL DEFAULT nextval('report_key'),
  database_time timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone,
  text character varying,
  hashtags json,
  urls character varying,
  user_mentions json,
  lang character varying,
  CONSTRAINT pkey_tweets PRIMARY KEY (pkey)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE tweet_reports
  OWNER TO postgres;

-- Trigger: update_tweets_snapped_500m on tweets

CREATE TRIGGER update_tweet_reports
  AFTER INSERT OR UPDATE
  ON tweet_reports
  FOR EACH ROW
  EXECUTE PROCEDURE update_reports();

-- Add Geometry column to tweet_reports
SELECT AddGeometryColumn ('public','tweet_reports','the_geom',4326,'POINT',2);

-- Table: tweet_users
-- DROP TABLE tweet_users;

CREATE TABLE tweet_users
(
  pkey bigserial,
  user_hash character varying UNIQUE,
  reports_count integer	,
  CONSTRAINT pkey_tweet_users PRIMARY KEY (pkey)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE tweet_users
  OWNER TO postgres;

-- Table: web_reports
-- DROP TABLE tweet_reports;

CREATE TABLE web_reports
(
  pkey bigint NOT NULL DEFAULT nextval('report_key'),
  created_at timestamp with time zone DEFAULT now(),
  screen_name character varying,
  email character varying,
  text character varying,
  lang character varying,
  details_consent boolean,
  CONSTRAINT pkey_web PRIMARY KEY (pkey)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE web_reports
  OWNER TO postgres;

-- Trigger: update_tweets_snapped_500m on tweets

-- DROP TRIGGER update_tweets_snapped_500m ON tweets;

CREATE TRIGGER update_web_reports
  AFTER INSERT OR UPDATE
  ON web_reports
  FOR EACH ROW
  EXECUTE PROCEDURE update_reports();

-- Add Geometry column to tweet_reports
SELECT AddGeometryColumn ('public','web_reports','the_geom',4326,'POINT',2);

-- Create table for non spatial tweets
CREATE TABLE nonspatial_tweet_reports
(
  pkey bigserial NOT NULL,
  database_time timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone,
  text character varying,
  hashtags json,
  urls character varying,
  user_mentions json,
  lang character varying,
  CONSTRAINT pkey_nonspatial_tweets PRIMARY KEY (pkey)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE nonspatial_tweet_reports
  OWNER TO postgres;

CREATE TABLE tweet_reports_unconfirmed
(
 pkey bigserial,
 database_time timestamp with time zone DEFAULT now(),
 created_at timestamp with time zone,
 CONSTRAINT pkey_tweet_reports_unconfirmed PRIMARY KEY (pkey)
);
-- Add Geometry column to tweet_reports
SELECT AddGeometryColumn ('public','tweet_reports_unconfirmed','the_geom',4326,'POINT',2);

CREATE TABLE tweet_invitees
(
 pkey bigserial,
 user_hash character varying UNIQUE,
 CONSTRAINT pkey_tweet_invitees PRIMARY KEY (pkey)
);

CREATE TABLE nonspatial_tweet_users
(
  pkey bigserial,
  user_hash character varying UNIQUE,
  CONSTRAINT nonspatial_tweet_users_pkey PRIMARY KEY (pkey)
);

CREATE TABLE all_users
(
 pkey bigserial,
 user_hash character varying UNIQUE,
 CONSTRAINT all_users_pkey PRIMARY KEY (pkey)
);

CREATE unique INDEX all_users_index ON all_users(user_hash);

CREATE OR REPLACE FUNCTION update_all_users()
  RETURNS trigger AS $update_all_users$

	BEGIN
		INSERT INTO all_users(user_hash) SELECT NEW.user_hash WHERE NOT EXISTS (SELECT user_hash FROM all_users WHERE user_hash = NEW.user_hash);
		RETURN NEW;
	END;
	
$update_all_users$ LANGUAGE plpgsql;

CREATE TRIGGER non_spatial_all_users BEFORE INSERT OR UPDATE ON nonspatial_tweet_users
	FOR EACH ROW EXECUTE PROCEDURE update_all_users();
CREATE TRIGGER tweet_invitees_all_users BEFORE INSERT OR UPDATE ON tweet_invitees
	FOR EACH ROW EXECUTE PROCEDURE update_all_users();
CREATE TRIGGER tweet_users_all_users BEFORE INSERT OR UPDATE ON tweet_users
	FOR EACH ROW EXECUTE PROCEDURE update_all_users();

--Function to update or insert tweet users
CREATE FUNCTION upsert_tweet_users(hash varchar) RETURNS VOID AS
$$
BEGIN
    LOOP
        -- first try to update the key
        UPDATE tweet_users SET reports_count = reports_count + 1 WHERE user_hash = hash;
        IF found THEN
            RETURN;
        END IF;
        -- not there, so try to insert the key
        -- if someone else inserts the same key concurrently,
        -- we could get a unique-key failure
        BEGIN
            INSERT INTO tweet_users(user_hash,reports_count) VALUES (hash, 1);
            RETURN;
        EXCEPTION WHEN unique_violation THEN
            -- Do nothing, and loop to try the UPDATE again.
        END;
    END LOOP;
END;
$$
LANGUAGE plpgsql;