import Link from "next/link";
import React from "react";

type Props = {
  category: NewsCategory | KnowledgeCategory;
  path: string;
  lang: Locale;
};

function NavLink({ category, path, lang }: Props) {
  return (
    <Link className="navLink" href={`/${lang}/${path}/${category}`}>
      {category}
    </Link>
  );
}

export default NavLink;
