import { useFilterState, FilterBuilder } from "@/src/components/filter-builder";

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
