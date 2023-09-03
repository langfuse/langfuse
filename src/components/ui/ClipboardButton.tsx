"use client";
import clipboardCopy from "clipboard-copy";
import { CheckCircleIcon, ClipboardIcon } from "lucide-react";
import { useState } from "react";
import { useToast } from "./use-toast";

const ClipboardButton = ({
  description = "",
  url = "",
  title = "",
  sidebar = true,
}: ShareButtonProps) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState<boolean>(false);
  const handleCopy = () => {
    clipboardCopy(sidebar ? url : `${title}\n${description}\n${url}`);
    setCopied(true);
    toast({
      title: `${title} ${description} copied to clipboard!`,
      description: (
        <pre className="mt-2 rounded-md bg-slate-950 p-4 w-full">
          <code className="text-white">
            {description} copied to clipboard ...
          </code>
        </pre>
      ),
    });
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className="focus:outline-none"
    >
      {copied ? (
        <CheckCircleIcon
          className={`${sidebar ? "h-6 w-6" : "h-9 w-9"} rounded-full`}
        />
      ) : (
        <ClipboardIcon
          className={`${sidebar ? "h-6 w-6" : "h-9 w-9"} rounded-full`}
        />
      )}
    </button>
  );
};

export default ClipboardButton;
