import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@/src/components/ui/dropdown-menu';
import { DeleteTraceMultiSelectAction } from '@/src/components/delete-trace';
import { Button } from '@/src/components/ui/button';
import { ChevronDown } from 'lucide-react';

export function TraceTableMultiSelectAction({
  selectedRows,
  projectId,
}: {
  selectedRows: object[];
  projectId: string;
}) {
  const traceIds = selectedRows.map((row) => {
    // @ts-ignore
    return row.original.id;
  })
  

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className='p-2 bg-white text-black font-medium'
          disabled={selectedRows.length < 1}
        >
          Actions
          <ChevronDown className='w-5 h-5' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='text-center'>
        <DropdownMenuItem>
          <DeleteTraceMultiSelectAction traceIds={traceIds} projectId={projectId} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
