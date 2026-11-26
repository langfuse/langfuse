BEGIN;

-- Classic writers update only the display projection and cannot advance the
-- versioned definition's revision. Accepting that write would hide the edit.
CREATE FUNCTION reject_unversioned_widget_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Editing a versioned widget requires a new revision'
        USING ERRCODE = '23514',
              CONSTRAINT = 'versioned_widget_update_requires_revision';
END;
$$;

CREATE TRIGGER guard_versioned_widget_update
BEFORE UPDATE ON dashboard_widgets
FOR EACH ROW
WHEN (
    OLD.definition IS NOT NULL AND NEW.revision <= OLD.revision AND
    ROW(OLD.definition, OLD.name, OLD.description, OLD.view, OLD.dimensions,
        OLD.metrics, OLD.filters, OLD.chart_type, OLD.chart_config, OLD.min_version)
    IS DISTINCT FROM
    ROW(NEW.definition, NEW.name, NEW.description, NEW.view, NEW.dimensions,
        NEW.metrics, NEW.filters, NEW.chart_type, NEW.chart_config, NEW.min_version)
)
EXECUTE FUNCTION reject_unversioned_widget_update();

COMMIT;
