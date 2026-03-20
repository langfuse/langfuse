import { Html, Head, Main, NextScript } from "next/document";
import type { DocumentContext, DocumentInitialProps } from "next/document";

type DocumentProps = DocumentInitialProps & { nonce: string };

export default function Document({ nonce }: DocumentProps) {
  return (
    <Html suppressHydrationWarning>
      <Head nonce={nonce}>
        <meta property="csp-nonce" content={nonce} />
      </Head>
      <body>
        <Main />
        <NextScript nonce={nonce} />
      </body>
    </Html>
  );
}

Document.getInitialProps = async (
  ctx: DocumentContext,
): Promise<DocumentProps> => {
  const initialProps = await ctx.defaultGetInitialProps(ctx);
  const nonce = (ctx.req?.headers["x-nonce"] as string) ?? "";
  return { ...initialProps, nonce };
};
