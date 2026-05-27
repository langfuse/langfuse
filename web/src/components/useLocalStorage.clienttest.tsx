import { act, renderHook, waitFor } from "@testing-library/react";
import useLocalStorage from "./useLocalStorage";

describe("useLocalStorage", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("notifies same-tab listeners after the local setter returns", async () => {
    const storageEvents: Event[] = [];
    const handleStorageEvent = (event: Event) => {
      storageEvents.push(event);
    };
    window.addEventListener("localStorageChange", handleStorageEvent);

    try {
      const { result } = renderHook(() => {
        const [firstValue, setFirstValue] = useLocalStorage(
          "useLocalStorage-test-key",
          "initial",
        );
        const [secondValue] = useLocalStorage(
          "useLocalStorage-test-key",
          "initial",
        );

        return { firstValue, setFirstValue, secondValue };
      });

      act(() => {
        result.current.setFirstValue("next");
      });

      expect(result.current.firstValue).toBe("next");
      expect(result.current.secondValue).toBe("initial");
      expect(storageEvents).toHaveLength(0);

      await waitFor(() => {
        expect(result.current.secondValue).toBe("next");
        expect(storageEvents).toHaveLength(1);
      });
    } finally {
      window.removeEventListener("localStorageChange", handleStorageEvent);
    }
  });
});
