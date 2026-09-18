import { render } from "@testing-library/react";

import { InAppAgentUpdateHighlight } from "./InAppAgentUpdateHighlight";

describe("InAppAgentUpdateHighlight", () => {
  it("restarts the highlight when the update id changes", () => {
    const { container, rerender } = render(
      <InAppAgentUpdateHighlight updateId="update-1">
        <div>Updated content</div>
      </InAppAgentUpdateHighlight>,
    );
    const firstHighlight = container.querySelector('[aria-hidden="true"]');

    rerender(
      <InAppAgentUpdateHighlight updateId="update-2">
        <div>Updated content</div>
      </InAppAgentUpdateHighlight>,
    );

    expect(firstHighlight).not.toBe(
      container.querySelector('[aria-hidden="true"]'),
    );
  });

  it("renders without an overlay before an Assistant update", () => {
    const { container } = render(
      <InAppAgentUpdateHighlight updateId={null}>
        <div>Content</div>
      </InAppAgentUpdateHighlight>,
    );

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
