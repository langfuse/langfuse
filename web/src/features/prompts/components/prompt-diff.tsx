import { parseDiff, Diff, Hunk, type HunkProps } from "react-diff-view";

export const PromptDiff = ({
  oldPromptText,
  newPromptText,
  oldPromptVersion,
  newPromptVersion,
  context = 3,
  oneChangePerToken = true
}: {
  oldPromptText: string;
  newPromptText: string;
  oldPromptVersion: number;
  newPromptVersion: number;
  context?: number;
  oneChangePerToken?: boolean;
}) => {

  const { createPatch } = require('diff');
  const EMPTY_HUNKS: HunkProps['hunk'][] = [];
  const options = {context: context, oneChangePerToken: oneChangePerToken};
  const patch = createPatch('prompt', oldPromptText, newPromptText, null, null, options);
  const diffText = patch.split('\n').slice(2).join('\n');
  const [diff] = parseDiff(diffText) || [];
  
  return (
    <div>
      <table className="diff diff-split">
        <thead>
          <tr>
            <th className="text-xs font-medium">Previous Prompt (Version {oldPromptVersion})</th>
            <th className="text-xs font-medium">Current Prompt (Version {newPromptVersion})</th>
          </tr>
        </thead>
      </table>
      <Diff viewType="split" diffType="modify" hunks={diff.hunks || EMPTY_HUNKS}>
        {hunks => hunks.map(hunk => (
          <Hunk key={hunk.content} hunk={hunk} />
        ))}
      </Diff>
    </div>
  );

};
