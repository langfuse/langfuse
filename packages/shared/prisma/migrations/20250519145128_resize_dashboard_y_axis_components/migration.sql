/* Triple y and y_size in dashboards.definition->'widgets' */
WITH updated AS (
    SELECT
        id,
        CASE
            WHEN jsonb_array_length(definition->'widgets') = 0 THEN definition
            ELSE jsonb_set(
                definition,                             -- original JSON
                '{widgets}',                            -- path to replace
                (
                    SELECT jsonb_agg(                     -- rebuild widgets array
                    /* 1) y  * 3   2) y_size * 3       */
                                   jsonb_set(
                                           jsonb_set(widget, '{y}',
                                                     to_jsonb( ((widget->>'y')::int * 3) ),  /* y  */
                                                     true
                                           ),
                                           '{y_size}',
                                           to_jsonb( ((widget->>'y_size')::int * 3) ),/* y_size */
                                           true
                                   )
                           )
                    FROM jsonb_array_elements(definition->'widgets') AS widget
                ),
                true                                    -- create path if absent
            )
        END AS new_def
    FROM dashboards
)
UPDATE dashboards d
SET    definition = u.new_def
FROM   updated u
WHERE  d.id = u.id;
