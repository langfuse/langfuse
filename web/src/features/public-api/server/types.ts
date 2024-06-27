export type ApiAccessScope = {
  projectId: string;
  accessLevel: "all" | "scores";
  userId? : string;
};
