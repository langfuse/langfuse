import { ScoreOutputDescriptionFields } from "./components/ScoreOutputDescriptionFields/ScoreOutputDescriptionFields";
import { ScoreOutputSection } from "./components/ScoreOutputSection/ScoreOutputSection";
import {
  type ScoreOutputFormState,
  type ScoreOutputSelectorState,
} from "@/src/features/evals/v2/scoreOutputTypes";

type ScoreOutputConfigurationProps = { state: ScoreOutputFormState } & (
  | {
      mode: "editable";
      onChange: (state: ScoreOutputFormState) => void;
    }
  | { mode: "read-only" }
);

/** Complete score-output configuration shared by setup and saved definitions. */
export function ScoreOutputConfiguration(props: ScoreOutputConfigurationProps) {
  const readOnly = props.mode === "read-only";
  const change = (next: ScoreOutputFormState) => {
    if (props.mode === "editable") props.onChange(next);
  };
  const changeSelector = (selector: ScoreOutputSelectorState) =>
    change({ ...props.state, ...selector });

  return (
    <div className="@container flex flex-col gap-4">
      <ScoreOutputSection
        state={props.state}
        onChange={changeSelector}
        readOnly={readOnly}
      />
      <ScoreOutputDescriptionFields
        scoreDescription={props.state.scoreDescription}
        reasoningDescription={props.state.reasoningDescription}
        onScoreDescriptionChange={(scoreDescription) =>
          change({ ...props.state, scoreDescription })
        }
        onReasoningDescriptionChange={(reasoningDescription) =>
          change({ ...props.state, reasoningDescription })
        }
        disabled={readOnly}
      />
    </div>
  );
}
