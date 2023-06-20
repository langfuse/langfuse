import { CodeView } from "@/src/components/ui/code";
import { type LLMChatMessages } from "@/src/utils/types";

export default function Prompt(props: { messages: LLMChatMessages[] }) {
  return (
    <>
      {props.messages.map((message, index) => (
        <div key={index}>
          <div className="mb-2 mt-5">
            <h3 className="inline-flex items-baseline rounded-full bg-gray-100  px-2.5 py-0.5 text-sm font-medium leading-6 text-gray-800 md:mt-2 lg:mt-0">
              {message.role}
            </h3>
          </div>
          <CodeView>{message.content}</CodeView>
        </div>
      ))}
    </>
  );
}
