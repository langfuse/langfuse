"use client";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState, useTransition } from "react";
const knowledgeVisibility = ["public", "paid", "private"];
import KnowledgeTags from "./KnowledgeTags";
import { CollectionType } from "chromadb/dist/main/types";
import { User } from "next-auth";
import { Button } from "@/src/components/ui/button";
import {
  FormMessage,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { useToast } from "@/src/components/ui/use-toast";
import { CollectionMetadataSchema } from "@/src/utils/middleware/chroma/collection";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { addCollection } from "@/src/utils/actions/collection";
type Props = {
  lang: Locale;
  availableCollections: CollectionType[];
  user: User | null;
  projectId: string;
};
const suggestions = [
  { id: "Vietnam", text: "Vietnam", weight: 0 },
  { id: "Turkey", text: "Turkey", weight: 0 },
  { id: "Thailand", text: "Thailand" },
  { id: "India", text: "India" },
];

const AddCollection = ({ lang, availableCollections, user, projectId }: Props) => {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof CollectionMetadataSchema>>({
    resolver: zodResolver(CollectionMetadataSchema),
    defaultValues: { visibility: "private", description: "" },
  });
  const knowledgeTags: KnowledgeTag[] = [];
  const [tags, setTags] = useState<KnowledgeTag[]>(knowledgeTags);

  const [isPending, startTransition] = useTransition();
  function onSubmit(data: z.infer<typeof CollectionMetadataSchema>) {
    console.log("tags", tags);
    const collectionCandidate: CollectionMetadata = {
      ...data,
      owner: JSON.stringify(user),
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectId: projectId,
      // tags: tags ? tags : [],
      tags: tags.map((tag) => `${tag.id}:${tag.text}`).join(","),
    };
    startTransition(() => addCollection(collectionCandidate));
    toast({
      title: "You submitted the following values:",
      description: (
        <pre className="mt-2 w-[340px] rounded-md bg-slate-950 p-4">
          <code className="text-white">
            {JSON.stringify(collectionCandidate, null, 2)}
          </code>
        </pre>
      ),
    });
  }
  return (
    <Form {...form}>
      <form
        // action={startTransition(form.handleSubmit(onSubmit))}
        // action={mutationUpdateCollection}

        onSubmit={form.handleSubmit(onSubmit)}
        className="mx-auto w-2/3 space-y-6"
      >
        <div className="flex flex-col justify-between gap-2 md:flex-row">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input
                    disabled={isPending}
                    placeholder="Titel der Library"
                    {...field}
                  />
                </FormControl>
                <FormDescription />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="visibility"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Sichtbarkeit</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="flex flex-col space-y-1 md:flex-row"
                  >
                    {knowledgeVisibility.map((category) => (
                      <FormItem
                        key={category}
                        className="flex items-center space-x-3 space-y-0"
                      >
                        <FormControl>
                          <RadioGroupItem value={category} />
                        </FormControl>
                        <FormLabel className="font-normal">
                          {category}
                        </FormLabel>
                      </FormItem>
                      // <SelectItem key={category} value={category}>
                      //   {category}
                      // </SelectItem>
                    ))}

                    {/* <FormItem className="flex items-center space-x-3 space-y-0">
            <FormControl>
              <RadioGroupItem value="mentions" />
            </FormControl>
            <FormLabel className="font-normal">
              Direct messages and mentions
            </FormLabel>
          </FormItem>
          <FormItem className="flex items-center space-x-3 space-y-0">
            <FormControl>
              <RadioGroupItem value="none" />
            </FormControl>
            <FormLabel className="font-normal">Nothing</FormLabel>
          </FormItem> */}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Beschreibung</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Kurzbeschreibung (256 Zeichen)"
                  {...field}
                />
              </FormControl>
              <FormDescription />
              <FormMessage />
            </FormItem>
          )}
        />
        <KnowledgeTags
          suggestions={suggestions}
          tags={tags}
          setTags={setTags}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
};

export default AddCollection;
