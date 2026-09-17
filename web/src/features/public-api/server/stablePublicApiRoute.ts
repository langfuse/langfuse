import { type NextApiRequest, type NextApiResponse } from "next";
import { type ZodType } from "zod";
import {
  createAuthedProjectAPIRoute,
  type AuthedProjectAPIRouteConfig,
} from "./createAuthedProjectAPIRoute";
import { withMiddlewares, type HttpMethod } from "./withMiddlewares";
import { structuredPublicApiErrorContract } from "./structuredPublicApiErrorContract";

type StablePublicApiRouteConfig<
  TQuery extends ZodType<any>,
  TBody extends ZodType<any>,
  TResponse extends ZodType<any>,
> = Omit<
  AuthedProjectAPIRouteConfig<TQuery, TBody, TResponse>,
  "errorContract"
>;

type StablePublicApiHandlers = {
  [Method in HttpMethod]?: (
    req: NextApiRequest,
    res: NextApiResponse,
  ) => Promise<void>;
};

export const createStablePublicApiRoute = <
  TQuery extends ZodType<any>,
  TBody extends ZodType<any>,
  TResponse extends ZodType<any>,
>(
  routeConfig: StablePublicApiRouteConfig<TQuery, TBody, TResponse>,
) =>
  createAuthedProjectAPIRoute({
    ...routeConfig,
    errorContract: structuredPublicApiErrorContract,
  });

export const withStablePublicApiMiddlewares = (
  handlers: StablePublicApiHandlers,
) =>
  withMiddlewares(handlers, {
    errorContract: structuredPublicApiErrorContract,
  });
