// https://tailwindui.com/components/application-ui/data-display/description-lists

import clsx from "clsx";
import { type ReactNode } from "react";

export default function DescriptionList(props: {
  header?: {
    title: string;
    description: string;
  };
  items: { label: string; value: string | ReactNode }[];
  descriptionColumns?: number;
  valueColumns?: number;
}) {
  const { descriptionColumns = 1, valueColumns = 2 } = props;
  const totalColumns = descriptionColumns + valueColumns;
  return (
    <div>
      {props.header ? (
        <div className="px-4 sm:px-0">
          <h3 className="text-base font-semibold leading-7 text-gray-900">
            {props.header.title}
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
            {props.header.description}
          </p>
        </div>
      ) : null}
      <div className={clsx(props.header && "mt-6 border-t border-gray-100")}>
        <dl className="divide-y divide-gray-100">
          {props.items.map((item) => (
            <div
              key={item.label}
              className={`sm:grid-cols-${totalColumns} px-4 py-3 sm:grid sm:gap-4 sm:px-0`}
            >
              <dt className="text-sm font-medium leading-6 text-gray-900">
                {item.label}
              </dt>
              <dd
                className={`mt-1 text-sm leading-6 text-gray-700 sm:col-span-${valueColumns} sm:mt-0`}
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
