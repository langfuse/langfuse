import LiveTimestamp from "@/src/components/ui/LiveTimestamp";
import { Button } from "@/src/components/ui/button";
import { ChatBubbleBottomCenterIcon } from "@heroicons/react/24/solid";
import { type User } from "next-auth";
import Link from "next/link";
import React from "react";

type Props = {
  projectId: string;
  name: string;
  metadata: Record<string, any>;
  lang: Locale;
  user: User | null;
};

const CollectionCard = ({ projectId, name, metadata, lang, user }: Props) => {
  return (
    <Link
      title={metadata.title}
      href={`/project/${projectId}/knowledge/${name}/document?title=${metadata.title}`}
      // className={`${
      //   searchString.length > 0 && !name.includes(searchString) ? "hidden" : ""
      // }`}
    >
      <article className="flex flex-col rounded-lg bg-slate-100 shadow-sm transition-all duration-200 ease-out hover:scale-105 hover:bg-slate-200 hover:shadow-lg dark:bg-slate-800">
        {metadata.image && (
          <img
            src={metadata.image}
            alt={metadata.title}
            className="h-56 w-full rounded-t-lg object-cover shadow-md"
          />
        )}
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col p-5">
            <h2 className="truncate font-serif font-bold">{metadata.title}</h2>
            <section className="mt-2 flex-1">
              <p className="line-clamp-3 md:line-clamp-5 lg:line-clamp-6">
                {metadata.description}
              </p>
            </section>
            <footer className="ml-auto space-x-1 pt-5 text-right text-xs italic text-gray-400">
              {/* <p>{JSON.parse(metadata.owner).name}</p> */}
              {metadata.owner && <p>Owner: {JSON.parse(metadata.owner).name}</p>}

              <p>
                <LiveTimestamp lang={lang} time={metadata.publishedAt} />
                <LiveTimestamp lang={lang} time={metadata.updatedAt} />
              </p>
            </footer>
          </div>
          <div className="flex flex-col items-center px-2">
            <div className="flex gap-1">
              <Button title="Chat with Document">
                <span className="mr-2">Chat with Document</span>
                <ChatBubbleBottomCenterIcon className="h-8 w-8" />
              </Button>
              {/* <Button>Artikel zu Wissen umwandeln</Button> */}
            </div>

            {/* <Link
            className="w-full p-2 text-center hover:underline"
            target="_blank"
            href={metadata.url}
          >
            Artikel Lesen
          </Link> */}
          </div>
        </div>
      </article>
    </Link>
  );
};

export default CollectionCard;
