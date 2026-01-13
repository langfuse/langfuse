
-- CreateIndex
CREATE UNIQUE INDEX CONCURRENTLY "notification_preferences_user_id_project_id_channel_type_key" ON "notification_preferences"("user_id", "project_id", "channel", "type");
