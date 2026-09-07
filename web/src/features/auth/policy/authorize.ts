import { ForbiddenError } from "@langfuse/shared";

import {
  wildcard,
  type Action,
  type AuthorizationContext,
  type Decision,
  type ErrorResult,
  type Policy,
  type Resource,
} from "./types";

/** authorize evaluates the policies for action on resource: a matching deny 403s, else a matching allow succeeds, else implicit-deny 403. */
export function authorize(
  ctx: AuthorizationContext,
  action: Action,
  resource: Resource,
): Decision {
  const matches = ctx.policies
    .filter(hasResourceKind(resource))
    .filter(hasAction(action))
    .filter(hasResourceId(resource));

  if (matches.some(hasEffect("deny"))) {
    return forbidden();
  }
  if (matches.some(hasEffect("allow"))) {
    return { success: true };
  }
  return forbidden();
}

/** hasResourceKind matches a policy of the kind that governs the checked resource. */
const hasResourceKind = (resource: Resource) => (p: Policy) =>
  p.kind === ("projectId" in resource ? "project" : "organization");

/** hasResourceId matches a policy whose resources cover the checked resource's id, by wildcard or listing. */
const hasResourceId = (resource: Resource) => (p: Policy) =>
  p.resources === wildcard ||
  p.resources.includes(
    "projectId" in resource ? resource.projectId : resource.orgId,
  );

/** hasAction matches a policy granting the action explicitly; actions are never wildcarded. */
const hasAction = (action: Action) => (p: Policy) =>
  (p.actions as readonly string[]).includes(action);

/** hasEffect matches a policy of the given effect. */
const hasEffect = (effect: Policy["effect"]) => (p: Policy) =>
  p.effect === effect;

/** forbidden builds a 403 Decision carrying the generic ForbiddenError. */
function forbidden(): ErrorResult<ForbiddenError> {
  return { success: false, error: new ForbiddenError() };
}
