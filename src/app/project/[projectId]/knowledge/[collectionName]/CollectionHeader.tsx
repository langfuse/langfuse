import { User } from "next-auth";
import EditCollection from "./EditCollection";

type Props = {
  lang: Locale;
  metadata: CollectionMetadata;
  user: User | null;
  collectionName: string;
};

const CollectionHeader = ({
  lang,
  metadata,
  user,
  collectionName,
}: Props) => {
  const { title, description, use, visibility } = metadata;

  return (
    <nav className="w-full p-6">
      {/* {user && user.roles.includes("admin") ? ( */}
        <EditCollection
          collectionName={collectionName}
          lang={lang}
          metadata={metadata}
        />
      {/* // ) : (
      //   <div>
      //     <h2 className="text-4xl font-bold font-serif italic">{title}</h2>
      //     <p>
      //       <b>Beschreibung</b>: <i className="font-serif">{description}</i>
      //     </p>
      //     <p>
      //       <b>Verwendung</b>: <i className="font-serif">{use}</i>
      //     </p>
      //     <p>
      //       <b>Verfügbarkeit</b>: <i className="font-serif">{visibility}</i>
      //     </p>
      //   </div>
      // )} */}
    </nav>
  );
};

export default CollectionHeader;
