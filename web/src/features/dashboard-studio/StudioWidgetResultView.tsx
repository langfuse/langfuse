import { DataCard } from "@/src/components/design-system/DataCard/DataCard";
import {
  StudioWidgetResultPresentation,
  type StudioWidgetCardResultProps,
} from "./StudioWidgetResultPresentation";

/** Dashboard card composition with query execution supplied by its result owner. */
export function StudioWidgetResultView(props: StudioWidgetCardResultProps) {
  return <StudioWidgetResultPresentation {...props} Frame={DataCard} />;
}
