import { type NextPage } from "next";
import Head from "next/head";

const HFTest: NextPage = () => {
  return (
    <>
      <Head>
        <title>Langfuse Dev Server Test</title>
      </Head>
      <div className="m-0 flex h-screen flex-col p-0 font-sans">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-4 py-3">
          <span className="text-sm text-gray-700">
            Langfuse Development Server
          </span>
          <div className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs text-white">
            Embedded View
          </div>
        </div>
        <iframe
          src="http://localhost:3000/auth/sign-up"
          allow="clipboard-write"
          title="Langfuse Dev Server"
          className="w-full flex-1 border-none bg-white"
        />
      </div>
    </>
  );
};

export default HFTest;
