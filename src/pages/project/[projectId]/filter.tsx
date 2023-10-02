import { FilterBuilder } from "@/src/features/filters/components/filter-builder";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";

const cols: ColumnDefinition[] = [
  {
    name: "col1",
    type: "string",
    internal: "col1",
  },
  {
    name: "col2",
    type: "number",
    internal: "col2",
  },
  {
    name: "col3",
    type: "datetime",
    internal: "col3",
  },
  {
    name: "col4",
    type: "stringOptions",
    internal: "col4",
    options: ["option1", "option2", "option3"].map((o, i) => ({
      value: o,
      count: i,
    })),
  },
];

const FilterPage = () => {
  const [filterState, setFilterState] = useQueryFilterState([]);

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
