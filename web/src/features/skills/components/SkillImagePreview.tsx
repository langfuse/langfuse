import { useEffect, useState } from "react";
import Image from "next/image";

export function SkillImagePreview({
  source,
  path,
}: {
  source: Blob | string;
  path: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string>();
  const [failedUrl, setFailedUrl] = useState<string>();
  const url = typeof source === "string" ? source : blobUrl;

  useEffect(() => {
    if (typeof source === "string") return;
    const objectUrl = URL.createObjectURL(source);
    setBlobUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [source]);

  if (url && failedUrl === url) {
    return (
      <p className="text-muted-foreground text-sm">
        This image could not be displayed. The file may be damaged or use an
        unsupported format.
      </p>
    );
  }
  if (!url)
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Loading image…
      </p>
    );

  return (
    <div className="relative h-full min-h-80 w-full">
      <Image
        src={url}
        alt={path}
        fill
        unoptimized
        sizes="100vw"
        className="object-contain"
        onError={() => setFailedUrl(url)}
      />
    </div>
  );
}
