-- Create cloudConfig.stripe.activeProductIds (array) from cloudConfig.stripe.activeProductId (string)
UPDATE organizations
SET cloud_config = (
    -- First, add the activeProductIds array
    jsonb_set(
        cloud_config,
        '{stripe, activeProductIds}',
        CASE
            WHEN cloud_config->'stripe'->'activeProductId' IS NOT NULL THEN
                jsonb_build_array(cloud_config->'stripe'->>'activeProductId')
            ELSE
                jsonb_build_array()
        END,
        true
    )
    -- Then, remove the activeProductId key
) #- '{stripe, activeProductId}'
WHERE cloud_config ? 'stripe' AND cloud_config->'stripe' ? 'activeProductId';
