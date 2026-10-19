import {
  Bot,
  Sparkles,
  Brain,
  Compass,
  Search,
  Shield,
  PenTool,
  Code,
  Rocket,
  Workflow,
  FlaskConical,
  BookOpen,
  Globe,
  Terminal,
  Lightbulb,
  MessageCircle,
  Puzzle,
  WandSparkles,
  Layers,
  Target,
  Heart,
  Star,
  Zap,
  Database,
  Cloud,
  ChartNoAxesCombined,
  KeyRound,
  Briefcase,
  GraduationCap,
  Music,
  Coffee,
  Leaf,
  Sun,
  Moon,
  Mountain,
  Gem,
  Cat,
  Dog,
  Bird,
  Rabbit,
  Fish,
  Bug,
  Turtle,
  Squirrel,
  Shell,
  Ghost,
  Octagon,
  Box,
  type LucideIcon,
} from "lucide-react";
import { type AgentAppearance, type AgentIconId } from "./appearance";

const icons: Record<AgentIconId, LucideIcon> = {
  bot: Bot,
  sparkles: Sparkles,
  brain: Brain,
  compass: Compass,
  search: Search,
  shield: Shield,
  pen: PenTool,
  code: Code,
  rocket: Rocket,
  workflow: Workflow,
  flask: FlaskConical,
  book: BookOpen,
  globe: Globe,
  terminal: Terminal,
  lightbulb: Lightbulb,
  message: MessageCircle,
  puzzle: Puzzle,
  wand: WandSparkles,
  layers: Layers,
  target: Target,
  heart: Heart,
  star: Star,
  zap: Zap,
  database: Database,
  cloud: Cloud,
  chart: ChartNoAxesCombined,
  key: KeyRound,
  briefcase: Briefcase,
  graduation: GraduationCap,
  music: Music,
  coffee: Coffee,
  leaf: Leaf,
  sun: Sun,
  moon: Moon,
  mountain: Mountain,
  gem: Gem,
  cat: Cat,
  dog: Dog,
  bird: Bird,
  rabbit: Rabbit,
  fish: Fish,
  bug: Bug,
  turtle: Turtle,
  squirrel: Squirrel,
  shell: Shell,
  ghost: Ghost,
  octagon: Octagon,
  cube: Box,
};
const sizes = { sm: "icon-base", md: "icon-lg", lg: "icon-xl" } as const;

export function AgentGlyph({
  appearance,
  size,
}: {
  appearance: AgentAppearance;
  size: keyof typeof sizes;
}) {
  const glyph = appearance.glyph;
  if (glyph.kind === "emoji") {
    return (
      <span
        aria-hidden="true"
        className={
          size === "lg" ? "text-3xl leading-none" : "text-lg leading-none"
        }
      >
        {glyph.value}
      </span>
    );
  }
  const Icon = icons[glyph.id];
  if (glyph.kind === "mascot") {
    return (
      <span
        aria-hidden="true"
        className="inline-flex rounded-xl border p-1.5"
        style={{
          borderColor: `${appearance.color}66`,
          backgroundColor: `${appearance.color}18`,
        }}
      >
        <Icon className={sizes[size]} style={{ color: appearance.color }} />
      </span>
    );
  }
  return (
    <Icon
      aria-hidden="true"
      className={sizes[size]}
      style={{ color: appearance.color }}
    />
  );
}
