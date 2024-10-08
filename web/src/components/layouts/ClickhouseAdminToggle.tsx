import * as React from "react";
import { useState } from "react";
import { cn } from "@/src/utils/tailwind";

export function ClickhouseAdminToggle() {
  const [isClickhouseEnabled, setIsClickhouseEnabled] = useState(() => {
    // Retrieve the initial state from session storage or default to false
    const storedValue = sessionStorage.getItem("isClickhouseEnabled");
    return storedValue ? JSON.parse(storedValue) : false;
  });

  const toggleClickhouse = () => {
    setIsClickhouseEnabled((prev) => {
      const newValue = !prev;
      // Store the new state in session storage
      sessionStorage.setItem("isClickhouseEnabled", JSON.stringify(newValue));
      return newValue;
    });
  };

  return (
    <div className="flex items-center space-x-2">
      <span>Clickhouse:</span>
      <button
        className={cn(
          "rounded px-2 py-1",
          isClickhouseEnabled ? "bg-green-500" : "bg-red-500",
        )}
        onClick={toggleClickhouse}
      >
        {isClickhouseEnabled ? "Enabled" : "Disabled"}
      </button>
    </div>
  );
}
