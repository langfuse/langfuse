import type {
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  TemplatesType,
} from "@rjsf/utils";

import ArrayFieldItemTemplate from "./ArrayFieldItemTemplate";
import ArrayFieldTemplate from "./ArrayFieldTemplate";
import BaseInputTemplate from "./BaseInputTemplate";
import DescriptionFieldTemplate from "./DescriptionFieldTemplate";
import ErrorListTemplate from "./ErrorListTemplate";
import FieldErrorTemplate from "./FieldErrorTemplate";
import FieldTemplate from "./FieldTemplate";
import ObjectFieldTemplate from "./ObjectFieldTemplate";
import TitleFieldTemplate from "./TitleFieldTemplate";
import WrapIfAdditionalTemplate from "./WrapIfAdditionalTemplate";
import {
  AddButton,
  CopyButton,
  MoveDownButton,
  MoveUpButton,
  RemoveButton,
  SubmitButton,
} from "./ButtonTemplates";

export function generateTemplates<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>(): Partial<TemplatesType<T, S, F>> {
  return {
    ArrayFieldItemTemplate,
    ArrayFieldTemplate,
    BaseInputTemplate,
    DescriptionFieldTemplate,
    ErrorListTemplate,
    FieldErrorTemplate,
    FieldTemplate,
    ObjectFieldTemplate,
    TitleFieldTemplate,
    WrapIfAdditionalTemplate,
    ButtonTemplates: {
      AddButton,
      CopyButton,
      MoveDownButton,
      MoveUpButton,
      RemoveButton,
      SubmitButton,
    },
  };
}

export {
  ArrayFieldItemTemplate,
  ArrayFieldTemplate,
  BaseInputTemplate,
  DescriptionFieldTemplate,
  ErrorListTemplate,
  FieldErrorTemplate,
  FieldTemplate,
  ObjectFieldTemplate,
  TitleFieldTemplate,
  WrapIfAdditionalTemplate,
  AddButton,
  CopyButton,
  MoveDownButton,
  MoveUpButton,
  RemoveButton,
  SubmitButton,
};
