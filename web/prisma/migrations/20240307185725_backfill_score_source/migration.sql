-- Set default values conditionally with explicit casting using a batched update
DO
$$
DECLARE 
   r record;
   rows_processed int;
BEGIN 
   LOOP
      rows_processed := 0;
      FOR r in 
         SELECT "name", "id"
         FROM "scores"
         WHERE "source" IS NULL
         LIMIT 1000
         FOR UPDATE 
      LOOP
         UPDATE "scores"
         SET "source" = CASE
            WHEN r.name = 'manual-score' THEN 'REVIEW'::"ScoreSource"
            ELSE 'API'::"ScoreSource"
         END
         WHERE "id" = r.id;

         rows_processed := rows_processed + 1;
      END LOOP;

      COMMIT;
      -- Exit the loop if we processed fewer rows than our limit
      EXIT WHEN rows_processed < 1000;
   END LOOP;
END
$$;
