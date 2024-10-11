import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { CodeBlock } from "@/src/components/ui/Codeblock";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";

interface Snippet {
  langCode: string;
  commentChar: string;
  snippets: string[];
}

interface Snippets {
  [key: string]: Snippet;
}

const SnippetBlocks = ({
  snippetLines,
  descriptions,
  langCode,
  commentChar,
}: {
  snippetLines: string[];
  descriptions: string[];
  langCode: string;
  commentChar: string;
}) => (
  <>
    {snippetLines.map((snippet, index) => (
      <div key={`${langCode}-${index}`}>
        <CodeBlock
          language={langCode}
          value={`${commentChar} ` + descriptions[index] + `\n` + snippet}
        />
        <br />
      </div>
    ))}
  </>
);
const DocumentationReference = ({ href }: { href: string }) => (
  <p className="mt-6 text-xs text-muted-foreground">
    For more information see the{" "}
    <a
      href={href}
      className="underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      documentation
    </a>{" "}
  </p>
);
/**
 * The CodeExamples component displays code snippets in multiple programming languages
 * in an accordion menu
 *
 * Each individual command is displayed in a separate code block that contains
 * an explanatory comment and a command
 *
 * @param {string} title: the text that displays on the clickable panel to open the snippets
 * @param {list} snippetLanguageConfig: a group of code examples
 * @param {list} descriptions: a concise, descriptive phrase about what the code snippet does
 * @param {string} docUrl: a link to relevant documentation
 * @returns {JSX.Element}
 */
export const CodeExamples = ({
  title,
  snippetLanguageConfig,
  descriptions,
  docUrl,
}: {
  title: string;
  snippetLanguageConfig: Snippets;
  descriptions: string[];
  docUrl: string;
}) => {
  const languageKeys = Object.keys(snippetLanguageConfig);
  if (languageKeys.length === 0) {
    return null;
  }

  return (
    <Accordion type="single" collapsible className="mt-10">
      <AccordionItem value="item-1">
        <AccordionTrigger>{title}</AccordionTrigger>
        <AccordionContent>
          <Tabs key="code-tab" defaultValue={languageKeys[0]}>
            <TabsList key="code-tab-triggers">
              {languageKeys.map((languageKey) => (
                <TabsTrigger
                  key={`tab-trigger-${languageKey}`}
                  value={languageKey}
                >
                  {languageKey}
                </TabsTrigger>
              ))}
            </TabsList>
            {languageKeys.map((languageKey) => {
              const languageInfo = snippetLanguageConfig[languageKey];

              return (
                <TabsContent
                  key={`tab-content-${languageKey}`}
                  value={languageKey}
                >
                  <SnippetBlocks
                    snippetLines={languageInfo.snippets}
                    descriptions={descriptions}
                    language={languageKey}
                    langCode={languageInfo.langCode}
                    commentChar={languageInfo.commentChar}
                  />
                </TabsContent>
              );
            })}
          </Tabs>
          <DocumentationReference href={docUrl} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
