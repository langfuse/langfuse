import Header from "@/src/components/layouts/header";

import { api } from "@/src/utils/api";
import { type ColumnDef } from "@tanstack/react-table";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import { useState } from "react";
import TableLink from "@/src/components/table/table-link";
import { type TableRowOptions } from "@/src/components/table/types";
import { DataTable } from "@/src/components/table/data-table";

import { useRouter } from "next/router";
import ScoresTable from "@/src/components/table/use-cases/scores";

export default function ScoresPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="md:container">
      <Header title="Scores" />
      <ScoresTable projectId={projectId} />
    </div>
  );
}
