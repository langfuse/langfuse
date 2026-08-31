"use client";

import type { ComponentProps, ComponentType } from "react";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

const openApiUrl = "../generated/api/openapi.yml";
const SwaggerUIWithoutValidator = SwaggerUI as ComponentType<
  ComponentProps<typeof SwaggerUI> & { validatorUrl: null }
>;

export function ApiReference() {
  return (
    <SwaggerUIWithoutValidator
      url={openApiUrl}
      deepLinking
      docExpansion="none"
      persistAuthorization={false}
      validatorUrl={null}
    />
  );
}
