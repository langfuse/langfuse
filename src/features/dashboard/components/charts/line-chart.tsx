"use client";
import React, { useState } from "react";
import {
  CartesianGrid,
  Dot,
  Legend,
  Line,
  LineChart as ReChartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type AxisDomain } from "recharts/types/util/types";

export interface LineChartProps extends BaseChartProps {
  curveType?: CurveType;
  connectNulls?: boolean;
}

interface ActiveDot {
  index?: number;
  dataKey?: string;
}

const LineChart = React.forwardRef<HTMLDivElement, LineChartProps>(
  (props, ref) => {
    const {
      data = [],
      categories = [],
      index,
      colors = themeColorRange,
      valueFormatter = defaultValueFormatter,
      startEndOnly = false,
      showXAxis = true,
      showYAxis = true,
      yAxisWidth = 56,
      animationDuration = 900,
      showAnimation = false,
      showTooltip = true,
      showLegend = true,
      showGridLines = true,
      autoMinValue = false,
      curveType = "linear",
      minValue,
      maxValue,
      connectNulls = false,
      allowDecimals = true,
      noDataText,
      className,
      onValueChange,
      ...other
    } = props;
    const [legendHeight, setLegendHeight] = useState(60);
    const [activeDot, setActiveDot] = useState<ActiveDot | undefined>(
      undefined,
    );

    const categoryColors = constructCategoryColors(categories, colors);

    const yAxisDomain = getYAxisDomain(autoMinValue, minValue, maxValue);
    const hasOnValueChange = !!onValueChange;

    function onDotClick(itemData: any, event: React.MouseEvent) {
      event.stopPropagation();

      if (!hasOnValueChange) return;
      if (
        (itemData.index === activeDot?.index &&
          itemData.dataKey === activeDot?.dataKey) ||
        (hasOnlyOneValueForThisKey(data, itemData.dataKey) &&
          activeLegend &&
          activeLegend === itemData.dataKey)
      ) {
        setActiveLegend(undefined);
        setActiveDot(undefined);
        onValueChange?.(null);
      } else {
        setActiveLegend(itemData.dataKey);
        setActiveDot({
          index: itemData.index,
          dataKey: itemData.dataKey,
        });
        onValueChange?.({
          eventType: "dot",
          categoryClicked: itemData.dataKey,
          ...itemData.payload,
        });
      }
    }

    function onCategoryClick(dataKey: string) {
      if (!hasOnValueChange) return;
      if (
        (dataKey === activeLegend && !activeDot) ||
        (hasOnlyOneValueForThisKey(data, dataKey) &&
          activeDot &&
          activeDot.dataKey === dataKey)
      ) {
        setActiveLegend(undefined);
        onValueChange?.(null);
      } else {
        setActiveLegend(dataKey);
        onValueChange?.({
          eventType: "category",
          categoryClicked: dataKey,
        });
      }
      setActiveDot(undefined);
    }

    return (
      <div ref={ref} className={"h-80 w-full"} {...other}>
        <ResponsiveContainer className="h-full w-full">
          {data?.length ? (
            <ReChartsLineChart
              data={data}
              onClick={
                hasOnValueChange && (activeLegend || activeDot)
                  ? () => {
                      setActiveDot(undefined);
                      setActiveLegend(undefined);
                      onValueChange?.(null);
                    }
                  : undefined
              }
            >
              {showGridLines ? (
                <CartesianGrid
                  className={tremorTwMerge(
                    // common
                    "stroke-1",
                    // light
                    "stroke-tremor-border",
                    // dark
                    "dark:stroke-dark-tremor-border",
                  )}
                  horizontal={true}
                  vertical={false}
                />
              ) : null}
              <XAxis
                hide={!showXAxis}
                dataKey={index}
                interval="preserveStartEnd"
                tick={{ transform: "translate(0, 6)" }}
                ticks={
                  startEndOnly
                    ? [data[0][index], data[data.length - 1][index]]
                    : undefined
                }
                fill=""
                stroke=""
                className={tremorTwMerge(
                  // common
                  "text-tremor-label",
                  // light
                  "fill-tremor-content",
                  // dark
                  "dark:fill-dark-tremor-content",
                )}
                tickLine={false}
                axisLine={false}
                padding={{ left: 10, right: 10 }}
                minTickGap={5}
              />
              <YAxis
                width={yAxisWidth}
                hide={!showYAxis}
                axisLine={false}
                tickLine={false}
                type="number"
                domain={yAxisDomain as AxisDomain}
                tick={{ transform: "translate(-3, 0)" }}
                fill=""
                stroke=""
                className={tremorTwMerge(
                  // common
                  "text-tremor-label",
                  // light
                  "fill-tremor-content",
                  // dark
                  "dark:fill-dark-tremor-content",
                )}
                tickFormatter={valueFormatter}
                allowDecimals={allowDecimals}
              />
              <Tooltip
                wrapperStyle={{ outline: "none" }}
                isAnimationActive={false}
                cursor={{ stroke: "#d1d5db", strokeWidth: 1 }}
                content={
                  showTooltip ? (
                    ({ active, payload, label }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload}
                        label={label}
                        valueFormatter={valueFormatter}
                        categoryColors={categoryColors}
                      />
                    )
                  ) : (
                    <></>
                  )
                }
                position={{ y: 0 }}
              />

              {showLegend ? (
                <Legend
                  verticalAlign="top"
                  height={legendHeight}
                  content={({ payload }) =>
                    ChartLegend(
                      { payload },
                      categoryColors,
                      setLegendHeight,
                      activeLegend,
                      hasOnValueChange
                        ? (clickedLegendItem: string) =>
                            onCategoryClick(clickedLegendItem)
                        : undefined,
                    )
                  }
                />
              ) : null}
              {categories.map((category) => (
                <Line
                  className={tremorTwMerge(
                    getColorClassNames(
                      categoryColors.get(category) ?? BaseColors.Gray,
                      colorPalette.text,
                    ).strokeColor,
                  )}
                  strokeOpacity={
                    activeDot || (activeLegend && activeLegend !== category)
                      ? 0.3
                      : 1
                  }
                  activeDot={(props: any) => {
                    const {
                      cx,
                      cy,
                      stroke,
                      strokeLinecap,
                      strokeLinejoin,
                      strokeWidth,
                      dataKey,
                    } = props;
                    return (
                      <Dot
                        className={tremorTwMerge(
                          "stroke-tremor-background dark:stroke-dark-tremor-background",
                          onValueChange ? "cursor-pointer" : "",
                          getColorClassNames(
                            categoryColors.get(dataKey) ?? BaseColors.Gray,
                            colorPalette.text,
                          ).fillColor,
                        )}
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill=""
                        stroke={stroke}
                        strokeLinecap={strokeLinecap}
                        strokeLinejoin={strokeLinejoin}
                        strokeWidth={strokeWidth}
                        onClick={(dotProps: any, event) =>
                          onDotClick(props, event)
                        }
                      />
                    );
                  }}
                  dot={(props: any) => {
                    const {
                      stroke,
                      strokeLinecap,
                      strokeLinejoin,
                      strokeWidth,
                      cx,
                      cy,
                      dataKey,
                      index,
                    } = props;

                    if (
                      (hasOnlyOneValueForThisKey(data, category) &&
                        !(
                          activeDot ||
                          (activeLegend && activeLegend !== category)
                        )) ||
                      (activeDot?.index === index &&
                        activeDot?.dataKey === category)
                    ) {
                      return (
                        <Dot
                          cx={cx}
                          cy={cy}
                          r={5}
                          stroke={stroke}
                          fill=""
                          strokeLinecap={strokeLinecap}
                          strokeLinejoin={strokeLinejoin}
                          strokeWidth={strokeWidth}
                          className={tremorTwMerge(
                            "stroke-tremor-background dark:stroke-dark-tremor-background",
                            onValueChange ? "cursor-pointer" : "",
                            getColorClassNames(
                              categoryColors.get(dataKey) ?? BaseColors.Gray,
                              colorPalette.text,
                            ).fillColor,
                          )}
                        />
                      );
                    }
                    return <></>;
                  }}
                  key={category}
                  name={category}
                  type={curveType}
                  dataKey={category}
                  stroke=""
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  isAnimationActive={showAnimation}
                  animationDuration={animationDuration}
                  connectNulls={connectNulls}
                />
              ))}
              {onValueChange
                ? categories.map((category) => (
                    <Line
                      className={tremorTwMerge("cursor-pointer")}
                      strokeOpacity={0}
                      key={category}
                      name={category}
                      type={curveType}
                      dataKey={category}
                      stroke="transparent"
                      fill="transparent"
                      legendType="none"
                      tooltipType="none"
                      strokeWidth={12}
                      connectNulls={connectNulls}
                      onClick={(props: any, event) => {
                        event.stopPropagation();
                        const { name } = props;
                        onCategoryClick(name);
                      }}
                    />
                  ))
                : null}
            </ReChartsLineChart>
          ) : (
            <NoData noDataText={noDataText} />
          )}
        </ResponsiveContainer>
      </div>
    );
  },
);

LineChart.displayName = "LineChart";

export default LineChart;
