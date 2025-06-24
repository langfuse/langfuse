import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import { type CustomerTenantMembershipPartsFragment } from "@team-plain/typescript-sdk";
import { PlainClient } from "@team-plain/typescript-sdk";

const plainClient = env.PLAIN_API_KEY
  ? new PlainClient({
      apiKey: env.PLAIN_API_KEY,
    })
  : null;

export const plainRouter = createTRPCRouter({
  updatePlainData: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const { session } = ctx;
      const user = session.user;
      const email = user.email;

      const CLOUD_REGION = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
      if (!CLOUD_REGION) {
        return;
      }

      if (!email) {
        logger.error("User email is required for Plain.com profile update");
        return;
      }

      if (!plainClient) {
        logger.error("Plain.com client not configured");
        return;
      }

      // Upsert customer in Plain.com
      const plainCustomer = await plainClient.upsertCustomer({
        identifier: {
          emailAddress: email,
        },
        onCreate: {
          email: {
            email: email,
            isVerified: true,
          },
          fullName: user.name ?? "",
        },
        onUpdate: {
          email: {
            email: email,
            isVerified: true,
          },
        },
      });
      const plainCustomerId = plainCustomer.data?.customer.id;
      if (!plainCustomerId) {
        logger.error(
          "Failed to upsert customer in Plain.com",
          plainCustomer.error,
        );
        return;
      }

      // Upsert tenants in Plain.com
      const tenantIdentifier = (orgId: string) =>
        `cloud_${CLOUD_REGION}_org_${orgId}`;
      const isTenantInRegion = (plainTenantId: string) =>
        plainTenantId.startsWith(`cloud_${CLOUD_REGION}_org_`);
      const tenantPromises = user.organizations.map(async (org) => {
        await plainClient.upsertTenant({
          identifier: {
            externalId: tenantIdentifier(org.id),
          },
          name: `${CLOUD_REGION} - ${org.name}`,
          externalId: tenantIdentifier(org.id),
        });
        await plainClient.updateTenantTier({
          tenantIdentifier: {
            externalId: tenantIdentifier(org.id),
          },
          tierIdentifier: {
            externalId:
              org.id === env.NEXT_PUBLIC_DEMO_ORG_ID ? "cloud:demo" : org.plan,
          },
        });
      });

      await Promise.all(tenantPromises);

      // Associate user with tenants
      // Fetch all pages of customer tenant memberships
      let plainCustomerTenantMemberships: CustomerTenantMembershipPartsFragment[] =
        [];
      let after: string | undefined = undefined;
      const pageSize = 100;
      while (true) {
        const response = await plainClient.getCustomerTenantMemberships({
          customerId: plainCustomerId,
          first: pageSize,
          after,
        });
        if (response.data?.tenantMemberships) {
          plainCustomerTenantMemberships.push(
            ...response.data.tenantMemberships,
          );
        }
        const pageInfo = response.data?.pageInfo;
        if (pageInfo?.hasNextPage && pageInfo.endCursor) {
          after = pageInfo.endCursor;
        } else {
          break;
        }
      }
      // Remove tenants from this region that are not in the user's organizations anymore
      const tenantIdsOfUserInRegion = plainCustomerTenantMemberships
        .map((tenant) => tenant.tenant.externalId)
        .filter((id) => isTenantInRegion(id));
      const tenantIdsOfUserInRegionToRemove = tenantIdsOfUserInRegion.filter(
        (tenantId) =>
          !user.organizations
            .map((org) => tenantIdentifier(org.id))
            .includes(tenantId),
      );
      if (tenantIdsOfUserInRegionToRemove.length > 0) {
        await plainClient.removeCustomerFromTenants({
          customerIdentifier: {
            emailAddress: email,
          },
          tenantIdentifiers: tenantIdsOfUserInRegionToRemove.map((id) => ({
            externalId: id,
          })),
        });
      }
      // Add user to tenants
      const tenantIdsOfUserInRegionToAdd = user.organizations
        .map((org) => tenantIdentifier(org.id))
        .filter((tenantId) => !tenantIdsOfUserInRegion.includes(tenantId));
      if (tenantIdsOfUserInRegionToAdd.length > 0) {
        await plainClient.addCustomerToTenants({
          customerIdentifier: {
            emailAddress: email,
          },
          tenantIdentifiers: tenantIdsOfUserInRegionToAdd.map((tenantId) => ({
            externalId: tenantId,
          })),
        });
      }
    } catch (error) {
      logger.error("Failed to update Plain.com profiles", error);

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update Plain.com profiles",
        cause: error,
      });
    }
  }),
});
