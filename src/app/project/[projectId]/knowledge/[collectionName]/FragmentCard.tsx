// import { Badge } from "@/components/ui/Badge";
// import LiveTimestamp from "@/components/ui/LiveTimestamp";
// import { Button } from "@/components/ui/button";
// import { FragmentMetadataEntity } from "@/lib/middleware/chroma/fragment";
import { FragmentMetadataEntity } from "@/src/utils/middleware/chroma/fragment";
import parse, { domToReact } from "html-react-parser";
import React from "react";

type Props = {
  visibility: string;
  name: string;
  metadata: FragmentMetadataEntity;
  pageContent: string;
  lang: Locale;
  index: number;
};
import { HTMLReactParserOptions, Element } from "html-react-parser";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import LiveTimestamp from "@/src/components/ui/LiveTimestamp";
import { LightBulbIcon } from "@heroicons/react/24/solid";

const options: HTMLReactParserOptions = {
  replace: (domNode) => {
    if (domNode instanceof Element && domNode.attribs) {
      // console.log("Replacing element ", domNode);
      const { attribs, children } = domNode;
      // console.log(Object.keys(attribs), "attribs keys");
      // console.log(Object.keys(domNode), "domNode keys");
      // console.log(domNode.name, "domNode name");
      // console.log(domNode.type, "domNode type");
      if (domNode.name === "p") {
        return <p className="text-xs">{domToReact(children, options)}</p>;
      }
      if (domNode.name === "h4") {
        return <h5 className="font-bold">{domToReact(children, options)}</h5>;
      }
      if (domNode.name === "h3") {
        return <h4 className="text-lg">{domToReact(children, options)}</h4>;
      }
      if (domNode.name === "h2") {
        return <h3 className="text-xs">{domToReact(children, options)}</h3>;
      }
      if (domNode.name === "h1") {
        return <h2 className="xs">{domToReact(children, options)}</h2>;
      }
    }
  },
};

const FragmentCard = ({
  visibility,
  name,
  metadata,
  pageContent,
  lang,
  index,
}: Props) => {
  return (
    <article
      title={metadata.paragraph}
      className="flex h-full flex-col rounded-lg bg-slate-100 shadow-sm transition-all duration-200 ease-out hover:scale-105 hover:bg-slate-200 hover:shadow-lg dark:bg-slate-800"
    >
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col p-5">
          <h4 className="truncate font-serif font-bold">
            Fragment <Badge variant="default">#{index + 1}</Badge>
          </h4>
          <section className="mt-2 flex-1">
            <div className="md:min-h-7.5 line-clamp-3 overflow-hidden hover:line-clamp-none hover:text-sm md:line-clamp-5 lg:line-clamp-5">
              {parse(pageContent, options)}
            </div>
          </section>
          <footer className="ml-auto space-x-1 pt-5 text-right text-xs italic text-gray-400">
            <p>
              <LiveTimestamp lang={lang} time={metadata.publishedAt!} />
            </p>
          </footer>
        </div>
        <div className="flex flex-col items-center px-2">
          <div className="flex gap-1">
            <Button title="Chat with Knowledge">Redact Personal Info</Button>
            <Button>
              Extract Knowledge
              <LightBulbIcon className="h-8 w-8" />
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
};

export default FragmentCard;
