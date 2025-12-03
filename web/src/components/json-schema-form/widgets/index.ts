import type {
  FormContextType,
  RegistryWidgetsType,
  RJSFSchema,
  StrictRJSFSchema,
} from "@rjsf/utils";

import CheckboxWidget from "./CheckboxWidget";
import CheckboxesWidget from "./CheckboxesWidget";
import RadioWidget from "./RadioWidget";
import RangeWidget from "./RangeWidget";
import SelectWidget from "./SelectWidget";
import TextareaWidget from "./TextareaWidget";
import TextWidget from "./TextWidget";

export function generateWidgets<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>(): RegistryWidgetsType<T, S, F> {
  return {
    CheckboxWidget,
    CheckboxesWidget,
    RadioWidget,
    RangeWidget,
    SelectWidget,
    TextareaWidget,
    TextWidget,
  };
}

export {
  CheckboxWidget,
  CheckboxesWidget,
  RadioWidget,
  RangeWidget,
  SelectWidget,
  TextareaWidget,
  TextWidget,
};
