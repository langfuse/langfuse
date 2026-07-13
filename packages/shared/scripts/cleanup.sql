DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_prisma_migrations') THEN
  DELETE FROM _prisma_migrations
  WHERE migration_name IN ('20240606090858_pricings_add_latest_gemini_models', '20240530212419_model_price_anthropic_via_google_vertex', '20240604133340_backfill_manual_scores', '20260203220622_pending_deletions_object_id_idx');
 END IF;
END $$;