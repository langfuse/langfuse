import {
  occupyExclusiveRightPanel,
  registerExclusiveRightPanel,
  resetExclusiveRightPanelsForTests,
} from "./exclusiveRightPanels";

describe("exclusiveRightPanels", () => {
  beforeEach(() => {
    resetExclusiveRightPanelsForTests();
  });

  it("closes every other registered panel when one occupies the rail", () => {
    const closeAssistant = vi.fn();
    const closeSupport = vi.fn();
    const closeMigration = vi.fn();

    registerExclusiveRightPanel("assistant", closeAssistant);
    registerExclusiveRightPanel("support", closeSupport);
    registerExclusiveRightPanel("migration", closeMigration);

    occupyExclusiveRightPanel("support");

    expect(closeAssistant).toHaveBeenCalledTimes(1);
    expect(closeMigration).toHaveBeenCalledTimes(1);
    expect(closeSupport).not.toHaveBeenCalled();
  });
});
