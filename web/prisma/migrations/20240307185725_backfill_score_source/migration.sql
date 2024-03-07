-- Set default values conditionally with explicit casting using a batched update
DO
$$
DECLARE 
   r record;
BEGIN 
   LOOP
      FOR r in 
         SELECT "name", "id"
         FROM "scores"
         WHERE "source" IS NULL
         LIMIT 1000
         FOR UPDATE 
      LOOP
         PERFORM pg_advisory_xact_lock(r.id); 

         UPDATE "scores"
         SET "source" = CASE
            WHEN r.name = 'manual-score' THEN 'REVIEW'::"ScoreSource"
            ELSE 'API'::"ScoreSource"
         END
         WHERE "id" = r.id;
      END LOOP;

      COMMIT;

      -- exit when no more rows to process
      IF NOT FOUND THEN 
         EXIT; 
      END IF; 
   END LOOP;
END
$$;