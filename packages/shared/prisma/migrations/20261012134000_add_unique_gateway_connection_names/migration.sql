CREATE UNIQUE INDEX gateway_ai_connections_organization_id_name_key
ON gateway_ai_connections(organization_id, name);

ALTER TABLE gateway_ai_connections
ADD CONSTRAINT gateway_ai_connections_name_without_colon
CHECK (position(':' in name) = 0);
