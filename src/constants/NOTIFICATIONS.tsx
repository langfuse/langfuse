import Link from "next/link";

export interface Notification {
  id: number;
  releaseDate: string;
  message: string | JSX.Element;
  description?: JSX.Element | string;
}

export const NOTIFICATIONS: Notification[] = [
  {
    id: 1,
    releaseDate: "01.02.2024",
    message: "Langfuse 2.0 just released 🚀 check it out",
    description: (
      <Link href={"https://www.langfuse.com/changelog"}>
        Click to check out the new features and improvements
      </Link>
    ),
  },
  {
    id: 2,
    releaseDate: "02.02.2024",
    message: "Langfuse 2.1 just released 🚀 check it out",
  },
  {
    id: 3,
    releaseDate: "05.02.2024",
    message: "Langfuse 2.2 just released 🚀 check it out",
  },
];
