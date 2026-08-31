"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

const openApiUrl = "../generated/api/openapi.yml";

export function ApiReference() {
  return (
    <SwaggerUI
      url={openApiUrl}
      deepLinking
      docExpansion="none"
      persistAuthorization={false}
      validatorUrl={null}
    />
  );
}
