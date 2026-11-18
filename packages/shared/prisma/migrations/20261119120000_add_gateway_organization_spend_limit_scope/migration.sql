-- Its own migration: the indexes using the new value need it committed first.
ALTER TYPE "GatewaySpendLimitScope" ADD VALUE IF NOT EXISTS 'ORGANIZATION';
