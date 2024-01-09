import { ChevronRightIcon } from "lucide-react";

import React from "react";

interface UserSettingCTAProps {
  item: {
    icon: React.ComponentType<{ style?: React.CSSProperties }>;
    name: string;
    description: string;
    onClick: () => void;
    dialog?: React.ReactNode;
  };
}

export default function UserSettingCTA({ item }: UserSettingCTAProps) {
  return (
    <li onClick={() => item.onClick()}>
      <div className="group relative flex items-start space-x-3 py-4">
        <div className="flex-shrink-0">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600">
            <item.icon
              style={{ height: "1.5rem", width: "1.5rem" }}
              aria-hidden="true"
            />
          </span>
        </div>
        <div className="min-w-0 flex-1 items-center">
          <div className="text-sm font-medium text-gray-900">
            <a className="cursor-pointer">
              <span className="absolute inset-0" aria-hidden="true" />
              {item.name}
            </a>
          </div>
          <p className="text-sm text-gray-500">{item.description}</p>
          {item.dialog}
        </div>
        <div className="flex-shrink-0 self-center">
          <ChevronRightIcon
            className="h-5 w-5 text-gray-400 group-hover:text-gray-500"
            aria-hidden="true"
          />
        </div>
      </div>
    </li>
  );
}
