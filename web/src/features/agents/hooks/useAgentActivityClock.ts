import { useEffect, useState } from "react";

/** One clock per visible agent list; activity indicators never poll per card. */
export function useAgentActivityClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);
  return now;
}
