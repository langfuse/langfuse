import { filterOperators } from "../../interfaces/filters";


export type DbOperator =
  | (typeof filterOperators)[keyof typeof filterOperators][number]
  | "!=";
export interface Filter {
  apply(): DbFilter;
  table: string;
  operator: DbOperator;
  field: string;
}
export type DbFilter = {
  query: string;
  params: { [x: string]: any } | {};
};

export class FilterList {
  private filters: Filter[];

  constructor(filters: Filter[] = []) {
    this.filters = filters;
  }

  push(...filter: Filter[]) {
    this.filters.push(...filter);
  }

  find(predicate: (filter: Filter) => boolean) {
    return this.filters.find(predicate);
  }

  filter(predicate: (filter: Filter) => boolean) {
    return new FilterList(this.filters.filter(predicate));
  }

  some(predicate: (filter: Filter) => boolean) {
    return this.filters.some(predicate);
  }

  forEach(callback: (filter: Filter) => void) {
    this.filters.forEach(callback);
  }

  length() {
    return this.filters.length;
  }

  public apply(): DbFilter {
    if (this.filters.length === 0) {
      return {
        query: "",
        params: {},
      };
    }
    const compiledQueries = this.filters.map((filter) => filter.apply());
    const { params, queries } = compiledQueries.reduce(
      (acc, { params, query }) => {
        acc.params = { ...acc.params, ...params };
        acc.queries.push(query);
        return acc;
      },
      { params: {}, queries: [] as string[] },
    );
    return {
      query: queries.join(" AND "),
      params,
    };
  }
}