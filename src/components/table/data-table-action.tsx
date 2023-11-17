import React from 'react';

import { DeleteTrace } from '@/src/components/delete-trace';

interface DataTableActionProps {
  traceId: string;
  projectId: string;
}

export function DataTableAction({
  traceId,
  projectId,
}: DataTableActionProps) {

  return (
    <div className='text-center'>
      <DeleteTrace traceId={traceId} icon={true} projectId={projectId} />
    </div>
  );
}
