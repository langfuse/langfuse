import { type GetStaticProps, type InferGetStaticPropsType } from "next";
import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";
import fs from "fs";
import yaml from "js-yaml";

const SwaggerUI = dynamic<{
  spec: any;
}>(import("swagger-ui-react"), { ssr: false });

function ApiDoc({ spec }: InferGetStaticPropsType<typeof getStaticProps>) {
  return <SwaggerUI spec={spec} />;
}

export const getStaticProps: GetStaticProps = async () => {
  const file = fs.readFileSync("./generated/openapi/openapi.yml", "utf8");
  const spec = yaml.load(file);

  return {
    props: {
      spec,
    },
  };
};

export default ApiDoc;
