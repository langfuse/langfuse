import {
  ReferenceNode,
  type KyselyPlugin,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type RootOperationNode,
} from "kysely";

import { QueryCompileError } from "./errors";
import { walkNodes } from "./nodes";

/**
 * Rejects every three-part column reference (`a.b.c`, from `sql.ref` or a
 * hand-built node). ClickHouse may read `e.col.field` as subcolumn `field`
 * of column `e.col`, while the passes after it read the middle part `col` as
 * the relation, so routing would decide for a relation that does not exist.
 * The check is on the reference's shape, not on what a pass would do with it.
 * Runs first in every compile. FROM/JOIN table names are not references;
 * `ctes.ts` rules on those.
 */
export class SchemaReferencePlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    walkNodes(args.node, (node) => {
      if (ReferenceNode.is(node) && node.table?.table.schema) {
        const { schema, identifier } = node.table.table;
        throw new QueryCompileError(
          `"${schema.name}.${identifier.name}" qualifies a column with two parts; the compile passes read only one. For a field of an Array(Tuple(…)) column use tupleArrayField(eb.ref("${schema.name}.${identifier.name}"), "<field>").`,
        );
      }
    });
    return args.node;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}
