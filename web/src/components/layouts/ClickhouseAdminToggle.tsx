import { Switch } from "@/src/components/ui/switch";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useSession } from "next-auth/react";

export const useClickhouse = () => {
  const session = useSession();
  const [isEnabled] = useLocalStorage<boolean>("useClickhouseQueries", false);

  return isEnabled && session.data?.user?.admin === true;
};

export function ClickhouseAdminToggle() {
  const [isEnabled, setIsEnabled] = useLocalStorage<boolean>(
    "useClickhouseQueries",
    false,
  );

  const handleToggle = () => {
    setIsEnabled((prev) => !prev);
    // You can add any additional logic here, such as API calls or analytics tracking
  };

  return (
    <div className="ml-auto flex items-center space-x-1">
      <div
        title={
          isEnabled ? "Disable Clickhouse Queries" : "Enable Clickhouse Queries"
        }
      >
        <Switch
          id="clickhouse-toggle"
          checked={isEnabled}
          onCheckedChange={() => {
            handleToggle();
          }}
        />
      </div>
    </div>
  );
}
