import { LangfuseIcon } from "@/src/components/LangfuseLogo";

export function Spinner(props: { message: string }) {
  return (
    <div className="flex min-h-full flex-1 flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <LangfuseIcon className="mx-auto motion-safe:animate-spin" size={42} />
        <h2 className="mt-5 text-center text-2xl font-bold leading-9 tracking-tight text-primary">
          {props.message} ...
        </h2>
      </div>
    </div>
  );
}
