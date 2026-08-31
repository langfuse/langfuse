import React from "react";

/**
 * Builds a recharts `dot` renderer that marks ONLY a series' isolated points
 * (see `prepareIsolatedPoints`). With honest gaps (`connectNulls` off), a
 * value with no drawable neighbor spans no line segment — this dot is the only
 * thing that makes it visible. All other points render nothing, keeping lines
 * clean. (LFE-10694)
 */
export const isolatedPointDot = (
  isolated: Set<number>,
  color: string,
  muted: boolean,
) =>
  function IsolatedPointDot(props: {
    key?: React.Key | null;
    cx?: number;
    cy?: number;
    index?: number;
  }): React.ReactElement<SVGElement> {
    const { key, cx, cy, index } = props;
    if (cx == null || cy == null || index == null || !isolated.has(index)) {
      return <g key={key} />;
    }
    return (
      <circle
        key={key}
        cx={cx}
        cy={cy}
        r={3}
        fill={color}
        fillOpacity={muted ? 0.2 : 1}
        stroke="none"
      />
    );
  };
