import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { chatAvailable, openChat } from "@/src/features/support-chat/chat";
import { Book, Github, Mail, MessageSquare, Slack } from "lucide-react";
import Link from "next/link";
import { SiDiscord } from "react-icons/si";

const supportChannels = [
  {
    icon: Book,
    title: "Documentation",
    description: "Find answers in the documentation.",
    href: "https://docs.langfuse.com",
    buttonText: "Visit Docs",
    primary: true,
  },
  {
    icon: Github,
    title: "GitHub Issues",
    description:
      "Create an issue on Github to report bugs or request new features.",
    href: "https://github.com/langfuse/langfuse/issues/new/choose",
    buttonText: "Create issue",
    primary: true,
  },
  {
    icon: Github,
    title: "GitHub Support",
    description: "Create a support ticket via GitHub discussions.",
    href: "https://github.com/orgs/langfuse/discussions/categories/support",
    buttonText: "Submit question",
    primary: true,
  },
  {
    icon: Mail,
    title: "Email",
    description: "Send email to our shared inbox: help@langfuse.com",
    href: "mailto:help@langfuse.com",
    buttonText: "Send Email",
    available: !chatAvailable,
  },
  {
    icon: MessageSquare,
    title: "Chat",
    description: "Get support directly from the team.",
    onClick: () => openChat(),
    available: chatAvailable,
    buttonText: "Launch Chat",
  },
  {
    icon: SiDiscord,
    title: "Discord",
    description:
      "Get support from community. Follow announcements to stay up to date with new features.",
    href: "https://langfuse.com/discord",
    buttonText: "Join Discord",
  },
  {
    icon: Slack,
    title: "Slack Connect",
    description: "Get a dedicated support channel for you and your team.",
    href: "mailto:help@langfuse.com?subject=Slack%20Connect%20Request&body=I'd%20like%20to%20request%20a%20dedicated%20Slack%20Connect%20channel%20for%20me%20and%20my%20team.%0D%0A%0D%0AUsers%20(emails)%20to%20include%20besides%20mine%3A%0D%0A%0D%0A",
    buttonText: "Request via Email",
  },
];

export const SupportChannels = () => (
  <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
    {supportChannels
      .filter((channel) => channel.available === undefined || channel.available)
      .map((channel) => (
        <Card key={channel.title} className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <channel.icon size={20} />
              {channel.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <CardDescription>{channel.description}</CardDescription>
          </CardContent>
          <CardFooter>
            {channel.href ? (
              <Button
                asChild
                variant={channel.primary ? "default" : "secondary"}
              >
                <Link href={channel.href}>{channel.buttonText}</Link>
              </Button>
            ) : (
              <Button
                onClick={channel.onClick}
                variant={channel.primary ? "default" : "secondary"}
              >
                {channel.buttonText}
              </Button>
            )}
          </CardFooter>
        </Card>
      ))}
  </div>
);
