import logger from "@/src/utils/logger";
import newrelic from "newrelic";
// eslint-disable-next-line @next/next/no-document-import-in-page
import Document, {
  type DocumentContext,
  type DocumentInitialProps,
  Html,
  Head,
  Main,
  NextScript,
} from "next/document";

type NewRelicProps = {
  browserTimingHeader: string;
};

class MyDocument extends Document<NewRelicProps> {
  static async getInitialProps(
    ctx: DocumentContext,
  ): Promise<DocumentInitialProps & NewRelicProps> {
    const initialProps = await Document.getInitialProps(ctx);

    /**
     * For SSG pages the build is faster than the agent connect cycle
     * In those cases, let's wait for the agent to connect before getting
     * the browser agent script.
     */

    const browserTimingHeader = newrelic.getBrowserTimingHeader({
      hasToRemoveScriptWrapper: true,
    });

    logger.info("NextJs New Relic redirecting to a page", {
      application: "NextJs NewRelic app logging",
      test: "Testing logging with Winston",
      pathname: ctx.pathname,
    });

    return {
      ...initialProps,
      browserTimingHeader,
    };
  }

  render() {
    return (
      <Html>
        <Head>
          <script
            type="text/javascript"
            dangerouslySetInnerHTML={{ __html: this.props.browserTimingHeader }}
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
