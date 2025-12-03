import type {
  ObjectFieldTemplateProps,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
} from "@rjsf/utils";
import { getTemplate, getUiOptions } from "@rjsf/utils";

export default function ObjectFieldTemplate<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>(props: ObjectFieldTemplateProps<T, S, F>) {
  const {
    description,
    title,
    properties,
    required,
    uiSchema,
    schema,
    registry,
  } = props;

  const uiOptions = getUiOptions<T, S, F>(uiSchema);
  const TitleFieldTemplate = getTemplate<"TitleFieldTemplate", T, S, F>(
    "TitleFieldTemplate",
    registry,
    uiOptions,
  );
  const DescriptionFieldTemplate = getTemplate<
    "DescriptionFieldTemplate",
    T,
    S,
    F
  >("DescriptionFieldTemplate", registry, uiOptions);

  return (
    <fieldset className="space-y-4">
      {title && (
        <TitleFieldTemplate
          id={`root-title`}
          title={title}
          required={required}
          schema={schema}
          uiSchema={uiSchema}
          registry={registry}
        />
      )}
      {description && (
        <DescriptionFieldTemplate
          id={`root-description`}
          description={description}
          schema={schema}
          uiSchema={uiSchema}
          registry={registry}
        />
      )}
      <div className="space-y-4">
        {properties.map((element) => (
          <div key={element.name} className="property-wrapper">
            {element.content}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
