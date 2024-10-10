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

const SnippetBlocks = ({
  snippets,
  descriptions,
  language,
  langCode,
  commentChar,
}) => (
  <TabsContent value={language}>
    {snippets.map((snippet, index) => (
      <div key={`${langCode}-${index}`}>
        <CodeBlock
          language={langCode}
          value={`${commentChar} ` + descriptions[index] + `\n` + snippet}
        />
        <br />
      </div>
    ))}
  </TabsContent>
);
const DocumentationReference = ({ href }) => (
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
 * @param {list} snippets: a set of code examples
 * @param {list} descriptsions: a concise, descriptive phrase about what the code snippet does
 * @param {string} docUrl: a link to relevant documentation
 * @returns {JSX.Element}
 */
export const CodeExamples = ({ title, snippets, descriptions, docUrl }) => {
  const languageKeys = Object.keys(snippets);
  return (
    <Accordion type="single" collapsible className="mt-10">
      <AccordionItem value="item-1">
        <AccordionTrigger>{title}</AccordionTrigger>
        <AccordionContent>
          <Tabs defaultValue={languageKeys[0]}>
            <TabsList>
              {languageKeys.map((languageKey) => (
                <TabsTrigger key={languageKey} value={languageKey}>
                  {languageKey}
                </TabsTrigger>
              ))}
            </TabsList>
            {languageKeys.map((languageKey) => {
              const languageInfo = snippets[languageKey];
              return (
                <SnippetBlocks
                  key={languageKey}
                  snippets={languageInfo.snippets}
                  descriptions={descriptions}
                  language={languageKey}
                  langCode={languageInfo.langCode}
                  commentChar={languageInfo.commentChar}
                />
              );
            })}
          </Tabs>
          <DocumentationReference href={docUrl} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
