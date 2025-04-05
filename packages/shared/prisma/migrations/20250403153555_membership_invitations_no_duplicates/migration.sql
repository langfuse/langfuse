-- Delete duplicate membership invitations, keeping only the newest one for each email and org_id combination
WITH ranked_invitations AS (
  SELECT 
    id,
    email,
    org_id,
    ROW_NUMBER() OVER (PARTITION BY email, org_id ORDER BY updated_at DESC) as rn
  FROM membership_invitations
)
DELETE FROM membership_invitations
WHERE id IN (
  SELECT id FROM ranked_invitations WHERE rn > 1
);


-- CreateIndex
CREATE UNIQUE INDEX "membership_invitations_email_org_id_key" ON "membership_invitations"("email", "org_id");
