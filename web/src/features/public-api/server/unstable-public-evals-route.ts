import { type NextApiRequest, type NextApiResponse } from "next";
import { type ZodType } from "zod";
import {
  createAuthedProjectAPIRoute,
  type AuthedProjectAPIRouteConfig,
} from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  withMiddlewares,
  type HttpMethod,
} from "@/src/features/public-api/server/withMiddlewares";
import { unstablePublicEvalsErrorContract } from "@/src/features/public-api/server/unstable-public-api-error-contract";

type UnstablePublicEvalsRouteConfig<
  TQuery extends ZodType<any>,
  TBody extends ZodType<any>,
  TResponse extends ZodType<any>,
> = Omit<
  AuthedProjectAPIRouteConfig<TQuery, TBody, TResponse>,
  "errorContract"
>;

type UnstablePublicEvalsHandlers = {
  [Method in HttpMethod]?: (
    req: NextApiRequest,
    res: NextApiResponse,
  ) => Promise<void>;
};

export const createUnstablePublicApiRoute = <
  TQuery extends ZodType<any>,
  TBody extends ZodType<any>,
  TResponse extends ZodType<any>,
>(
  routeConfig: UnstablePublicEvalsRouteConfig<TQuery, TBody, TResponse>,
) =>
  createAuthedProjectAPIRoute({
    ...routeConfig,
    errorContract: unstablePublicEvalsErrorContract,
  });

export const withUnstablePublicApiMiddlewares = (
  handlers: UnstablePublicEvalsHandlers,
) =>
  withMiddlewares(handlers, {
    errorContract: unstablePublicEvalsErrorContract,
  });

export const createUnstablePublicEvalsRoute = createUnstablePublicApiRoute;
export const withUnstablePublicEvalsMiddlewares =
  withUnstablePublicApiMiddlewares;
