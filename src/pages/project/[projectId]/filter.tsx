import { FilterBuilder } from "@/src/features/filters/components/filter-builder";
import { useFilterState } from "@/src/features/filters/hooks/useFilterState";

const cols = [
  {
    name: "col1",
    type: "string",
  },
  {
    name: "col2",
    type: "number",
  },
  {
    name: "col3",
    type: "datetime",
  },
  {
    name: "col4",
    type: "stringOptions",
    options: ["option1", "option2", "option3"].map((o, i) => ({
      value: o,
      count: i,
    })),
  },
] as const;

const FilterPage = () => {
  const [filterState, setFilterState] = useFilterState(cols, []);

  return (
    <>
      <FilterBuilder
        columns={cols}
        filterState={filterState}
        onChange={setFilterState}
      />
      <pre>{JSON.stringify(filterState, null, 2)}</pre>
    </>
  );
};

export default FilterPage;
