"use client";
import { Button } from "@/src/components/ui/button";
import { useToast } from "@/src/components/ui/use-toast";
import { deleteCollection } from "@/src/utils/actions/collection";
// import { Button } from "@/components/ui/button";
// import { useToast } from "@/components/ui/use-toast";
// import { deleteCollection } from "@/lib/actions/collection";
import { Trash2Icon } from "lucide-react";
import { useTransition } from "react";

type Props = { collectionName: string };
const DeleteCollectionButton = ({ collectionName }: Props) => {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const deleteCollectionMutation = async () => {
    startTransition(() => deleteCollection(collectionName));

    toast({
      title: "Library erfolgreich gelöscht",
      description: (
        <pre className="mt-2 w-[340px] rounded-md bg-slate-950 p-4">
          <code className="text-white">
            {JSON.stringify(collectionName, null, 2)}
          </code>
        </pre>
      ),
    });
  };
  return (
    <Button
      type="button"
      disabled={isPending}
      className="absolute right-2 top-2 rounded-full border p-2 hover:text-red-500"
      onClick={async (e) => {
        await deleteCollectionMutation();
      }}
      variant="ghost"
    >
      <Trash2Icon className="h-6 w-6" />
    </Button>
  );
};

export default DeleteCollectionButton;
