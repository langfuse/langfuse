import NextAuth from "next-auth";
import { authOptions } from "@/src/server/auth";

export default NextAuth(authOptions);
