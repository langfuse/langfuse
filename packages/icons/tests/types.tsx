import { createRef, type ComponentProps } from "react";
import { Search, type IconComponent } from "../src/index";
import { SiGithub } from "../src/si";
import { TbBrandAzure } from "../src/tb";

const icon: IconComponent = Search;
const props: ComponentProps<typeof Search> = {
  size: "sm",
  ref: createRef<SVGSVGElement>(),
};
<Search
  {...props}
  aria-label="Search"
  onClick={(event) => event.currentTarget.focus()}
/>;
<SiGithub size="lg" ref={createRef<SVGSVGElement>()} />;
<TbBrandAzure size="xl" />;
<Search __rawClassName="animate-spin" __rawStyle={{ width: 48 }} />;
<Search color="default" />;
<SiGithub color="secondary" />;
<TbBrandAzure color="inherit" />;

// @ts-expect-error Colors must come from the semantic palette.
<Search color="red" />;
// @ts-expect-error Raw CSS color values require the explicit escape hatch.
<SiGithub color="#fff" />;
// @ts-expect-error Unknown color tokens are rejected across all libraries.
<TbBrandAzure color="unknown" />;

// @ts-expect-error Numeric sizes bypass the semantic scale.
<Search size={16} />;
// @ts-expect-error Unknown semantic size.
<Search size="md" />;
// @ts-expect-error Use the explicit escape hatch instead.
<Search className="size-4" />;
// @ts-expect-error Use the explicit escape hatch instead.
<Search style={{ width: 16 }} />;
// @ts-expect-error Dimensions come from size.
<Search width={16} />;
// @ts-expect-error Dimensions come from size.
<Search height={16} />;
// @ts-expect-error Stroke width is controlled by the package.
<Search strokeWidth={3} />;
// @ts-expect-error Forbidden props in spreads must also be rejected.
<Search {...{ className: "size-4" }} />;
// @ts-expect-error The same constraints apply to React Icons.
<SiGithub size={24} />;
// @ts-expect-error The same constraints apply to Tabler icons.
<TbBrandAzure className="size-4" />;

void icon;
