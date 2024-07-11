import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { type Trace, type ScoreSource } from "@langfuse/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { TraceAggUsageBadge } from "@/src/components/token-usage-badge";
import { Badge } from "@/src/components/ui/badge";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { NewDatasetItemFromTrace } from "@/src/features/datasets/components/NewDatasetItemFromObservationButton";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { withDefault, StringParam, useQueryParam } from "use-query-params";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { ScoresPreview } from "@/src/components/trace/ScoresPreview";
import { AnnotateDrawer } from "@/src/features/manual-scoring/components/AnnotateDrawer";
import { type APIScore } from "@/src/features/public-api/types/scores";

export const TracePreview = ({
  trace,
  observations,
  scores,
}: {
  trace: Trace & { latency?: number };
  observations: ObservationReturnType[];
  scores: APIScore[];
}) => {
  const [selectedTab, setSelectedTab] = useQueryParam(
    "view",
    withDefault(StringParam, "preview"),
  );

  // const mockInput =
  // "## Overview\n\n* Follows [CommonMark](https://commonmark.org)\n* Optionally follows [GitHub Flavored Markdown](https://github.github.com/gfm/)\n* Renders actual React elements instead of using `dangerouslySetInnerHTML`\n* Lets you define your own components (to render `MyHeading` instead of `'h1'`)\n* Has a lot of plugins\n\n## Contents\n\nHere is an example of a plugin in action ([`remark-toc`](https://github.com/remarkjs/remark-toc)). **This section is replaced by an actual table of contents**.\n\n## Syntax highlighting\n\nHere is an example of a plugin to highlight code: [`rehype-highlight`](https://github.com/rehypejs/rehype-highlight).\n\n```js\nimport React from 'react'\nimport ReactDOM from 'react-dom'\nimport Markdown from 'react-markdown'\nimport rehypeHighlight from 'rehype-highlight'\n\nconst markdown = `\n# Your markdown here\n`\n\nReactDOM.render(\n  <Markdown rehypePlugins={[rehypeHighlight]}>{markdown}</Markdown>,\n  document.querySelector('#content')\n)\n```\n\nPretty neat, eh?\n\n## GitHub flavored markdown (GFM)\n\nFor GFM, you can *also* use a plugin: [`remark-gfm`](https://github.com/remarkjs/react-markdown#use). It adds support for GitHub-specific extensions to the language: tables, strikethrough, tasklists, and literal URLs.\n\nThese features **do not work by default**. 👆 Use the toggle above to add the plugin.\n\n| Feature    | Support              |\n| ---------: | :------------------- |\n| CommonMark | 100%                 |\n| GFM        | 100% w/ `remark-gfm` |\n\n~~strikethrough~~\n\n* [ ] task list\n* [x] checked item\n\nhttps://example.com\n\n## HTML in markdown\n\n⚠️ HTML in markdown is quite unsafe, but if you want to support it, you can use [`rehype-raw`](https://github.com/rehypejs/rehype-raw). You should probably combine it with [`rehype-sanitize`](https://github.com/rehypejs/rehype-sanitize).\n\n<blockquote>👆 Use the toggle above to add the plugin.</blockquote>\n\n## Components\n\nYou can pass components to change things:\n\n```js\nimport React from 'react'\nimport ReactDOM from 'react-dom'\nimport Markdown from 'react-markdown'\nimport MyFancyRule from './components/my-fancy-rule.js'\n\nconst markdown = `\n# Your markdown here\n`\n\nReactDOM.render(\n  <Markdown\n    components={{\n      // Use h2s instead of h1s\n      h1: 'h2',\n      // Use a component instead of hrs\n      hr(props) {\n        const {node, ...rest} = props\n        return <MyFancyRule {...rest} />\n      }\n    }}\n  >\n    {markdown}\n  </Markdown>,\n  document.querySelector('#content')\n)\n```\n\n## More info?\n\nMuch more info is available in the [readme on GitHub](https://github.com/remarkjs/react-markdown)!\n\n***\n\nA component by [Espen Hovlandsdal](https://espen.codes/)";
  // const mockInput = {
  //   messages: [
  //     {
  //       role: "system",
  //       content: "You are an intelligent assistant.",
  //     },
  //     {
  //       role: "user",
  //       content:
  //         "Can you show me an example of a JSON object with ChatML messages and Markdown?",
  //     },
  //     {
  //       role: "assistant",
  //       content:
  //         "## Overview\n\n* Follows [CommonMark](https://commonmark.org)\n* Optionally follows [GitHub Flavored Markdown](https://github.github.com/gfm/)\n* Renders actual React elements instead of using `dangerouslySetInnerHTML`\n* Lets you define your own components (to render `MyHeading` instead of `'h1'`)\n* Has a lot of plugins\n\n## Contents\n\nHere is an example of a plugin in action ([`remark-toc`](https://github.com/remarkjs/remark-toc)). **This section is replaced by an actual table of contents**.\n\n## Syntax highlighting\n\nHere is an example of a plugin to highlight code: [`rehype-highlight`](https://github.com/rehypejs/rehype-highlight).\n\n```js\nimport React from 'react'\nimport ReactDOM from 'react-dom'\nimport Markdown from 'react-markdown'\nimport rehypeHighlight from 'rehype-highlight'\n\nconst markdown = `\n# Your markdown here\n`\n\nReactDOM.render(\n  <Markdown rehypePlugins={[rehypeHighlight]}>{markdown}</Markdown>,\n  document.querySelector('#content')\n)\n```\n\nPretty neat, eh?\n\n## GitHub flavored markdown (GFM)\n\nFor GFM, you can *also* use a plugin: [`remark-gfm`](https://github.com/remarkjs/react-markdown#use). It adds support for GitHub-specific extensions to the language: tables, strikethrough, tasklists, and literal URLs.\n\nThese features **do not work by default**. 👆 Use the toggle above to add the plugin.\n\n| Feature    | Support              |\n| ---------: | :------------------- |\n| CommonMark | 100%                 |\n| GFM        | 100% w/ `remark-gfm` |\n\n~~strikethrough~~\n\n* [ ] task list\n* [x] checked item\n\nhttps://example.com\n\n## HTML in markdown\n\n⚠️ HTML in markdown is quite unsafe, but if you want to support it, you can use [`rehype-raw`](https://github.com/rehypejs/rehype-raw). You should probably combine it with [`rehype-sanitize`](https://github.com/rehypejs/rehype-sanitize).\n\n<blockquote>👆 Use the toggle above to add the plugin.</blockquote>\n\n## Components\n\nYou can pass components to change things:\n\n```js\nimport React from 'react'\nimport ReactDOM from 'react-dom'\nimport Markdown from 'react-markdown'\nimport MyFancyRule from './components/my-fancy-rule.js'\n\nconst markdown = `\n# Your markdown here\n`\n\nReactDOM.render(\n  <Markdown\n    components={{\n      // Use h2s instead of h1s\n      h1: 'h2',\n      // Use a component instead of hrs\n      hr(props) {\n        const {node, ...rest} = props\n        return <MyFancyRule {...rest} />\n      }\n    }}\n  >\n    {markdown}\n  </Markdown>,\n  document.querySelector('#content')\n)\n```\n\n## More info?\n\nMuch more info is available in the [readme on GitHub](https://github.com/remarkjs/react-markdown)!\n\n***\n\nA component by [Espen Hovlandsdal](https://espen.codes/)",
  //     },
  //   ],
  // };

  const traceScores = scores.filter((s) => s.observationId === null);
  const traceScoresBySource = traceScores.reduce((acc, score) => {
    if (!acc.get(score.source)) {
      acc.set(score.source, []);
    }
    acc.get(score.source)?.push(score);
    return acc;
  }, new Map<ScoreSource, APIScore[]>());

  return (
    <Card className="col-span-2 flex max-h-full flex-col overflow-hidden">
      <div className="flex flex-shrink-0 flex-row justify-end gap-2">
        <Tabs
          value={selectedTab}
          onValueChange={setSelectedTab}
          className="flex w-full justify-end border-b bg-background"
        >
          <TabsList className="bg-background py-0">
            <TabsTrigger
              value="preview"
              className="h-full rounded-none border-b-4 border-transparent data-[state=active]:border-primary-accent data-[state=active]:shadow-none"
            >
              Preview
            </TabsTrigger>
            <TabsTrigger
              value="scores"
              className="h-full rounded-none border-b-4 border-transparent data-[state=active]:border-primary-accent data-[state=active]:shadow-none"
            >
              Scores
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex w-full flex-col overflow-y-auto">
        <CardHeader className="flex flex-row flex-wrap justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>
              <span className="mr-2 rounded-sm bg-input p-1 text-xs">
                TRACE
              </span>
              <span>{trace.name}</span>
            </CardTitle>
            <CardDescription>
              {trace.timestamp.toLocaleString()}
            </CardDescription>
            <div className="flex flex-wrap gap-2">
              {!!trace.latency && (
                <Badge variant="outline">
                  {formatIntervalSeconds(trace.latency)}
                </Badge>
              )}
              <TraceAggUsageBadge observations={observations} />
              {!!trace.release && (
                <Badge variant="outline">Release: {trace.release}</Badge>
              )}
              {!!trace.version && (
                <Badge variant="outline">Version: {trace.version}</Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <AnnotateDrawer
              projectId={trace.projectId}
              traceId={trace.id}
              scores={scores}
              key={"annotation-drawer" + trace.id}
            />
            <NewDatasetItemFromTrace
              traceId={trace.id}
              projectId={trace.projectId}
              input={trace.input}
              output={trace.output}
              metadata={trace.metadata}
              key={trace.id}
            />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {selectedTab === "preview" && (
            <>
              <IOPreview
                key={trace.id + "-io"}
                input={trace.input ?? undefined}
                output={trace.output ?? undefined}
              />
              <JSONView
                key={trace.id + "-metadata"}
                title="Metadata"
                json={trace.metadata}
              />
              <ScoresPreview itemScoresBySource={traceScoresBySource} />
            </>
          )}
          {selectedTab === "scores" && (
            <ScoresTable
              projectId={trace.projectId}
              omittedFilter={["Trace ID"]}
              traceId={trace.id}
              hiddenColumns={["traceName", "jobConfigurationId", "userId"]}
              tableColumnVisibilityName="scoresColumnVisibilityTracePreview"
            />
          )}
        </CardContent>
        <CardFooter></CardFooter>
      </div>
    </Card>
  );
};
