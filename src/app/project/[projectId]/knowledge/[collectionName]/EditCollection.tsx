"use client";
import { type z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
// import { Button } from "@/components/ui/button";
// import {
//   Form,

// } from "@/components/ui/form";
// import { Input } from "@/components/ui/input";
// import { Textarea } from "@/components/ui/textarea";
// import {
//   CollectionDTO,
//   CollectionMetadataSchema,
// } from "@/util/middleware/chroma/collection";

import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
// import { useToast } from "@/components/ui/use-toast";
// import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useState, useTransition } from "react";
// import { updateCollection } from "@/util/actions/collection";
// import { updateCollection } from "@/lib/actions/collection";
const knowledgeVisibility = ["public", "paid", "private"];
import KnowledgeTags from "./KnowledgeTags";
import { CollectionType } from "chromadb/dist/main/types";
import { Button } from "@/src/components/ui/button";
import { updateCollection } from "@/src/utils/actions/collection";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Textarea } from "@/src/components/ui/textarea";
import {
  type CollectionDTO,
  CollectionMetadataSchema,
} from "@/src/utils/middleware/chroma/collection";
import { useToast } from "@/src/components/ui/use-toast";
import { Input } from "@/src/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { randomUUID } from "crypto";
type Props = {
  lang: Locale;
  metadata: CollectionMetadata;
  collectionName: string;
};
const suggestions = [
  { id: "Vietnam", text: "Vietnam", weight: 0 },
  { id: "Turkey", text: "Turkey", weight: 0 },
  { id: "Thailand", text: "Thailand" },
  { id: "India", text: "India" },
];

const EditCollection = ({ metadata, lang, collectionName }: Props) => {
  const { title, description, visibility } = metadata;
  const { toast } = useToast();
  const { data: session } = useSession();
  const form = useForm<z.infer<typeof CollectionMetadataSchema>>({
    resolver: zodResolver(CollectionMetadataSchema),
    defaultValues: { title, description, visibility },
  });
  // const knowledgeTags: KnowledgeTag[] = metadata?.tags
  //   ? metadata.tags
  //       ?.split(",")
  //       .map((tag) => ({ id: tag.split(":")[0] || randomUUID(), text: tag.split(":")[1] }))
  //   : [];
  // console.log("knowledgeTags", knowledgeTags);
  // const [tags, setTags] = useState<KnowledgeTag[]>(
  //   metadata?.tags ? metadata?.tags : []
  // );
  // const [tags, setTags] = useState<KnowledgeTag[]>(knowledgeTags);

  const [isPending, startTransition] = useTransition();
  function onSubmit(data: z.infer<typeof CollectionMetadataSchema>) {
    // console.log("tags", tags);
    const collectionCandidate: Omit<CollectionDTO, "id"> = {
      name: collectionName,
      metadata: {
        ...data,
        // tags: tags ? tags : [],
        // tags: tags.map((tag) => `${tag.id}:${tag.text}`).join(","),
      },
    };
    startTransition(() => updateCollection(visibility, collectionCandidate));
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
        {/* <FormField
          control={form.control}
          name="use"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Verwendung</FormLabel>
              <FormControl>
                <Textarea placeholder="Mögliche Anwendungsfälle" {...field} />
              </FormControl>
              <FormDescription />
              <FormMessage />
            </FormItem>
          )}
        /> */}
        {/* <KnowledgeTags
          suggestions={suggestions}
          tags={tags}
          setTags={setTags}
        /> */}
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
};

export default EditCollection;
