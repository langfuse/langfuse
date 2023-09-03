import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { FeatureFlagToggle } from "@/src/features/featureFlags/components/FeatureFlagToggle";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Construction } from "lucide-react";
import { useSession } from "next-auth/react";
import { Code, Bird, GraduationCap, Lock, LogOut } from "lucide-react";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";

import { Button } from "@/src/components/ui/button";



const instructionItems = [
  {
    name: "Manage Password",
    href: "https://langfuse.com/docs/integrations",
    description: "If you forget your password or want to change",

    icon: Lock,
  },
  {
    name: "LogOut",
    description: "Click button to safely end your current session now",
    href: "https://langfuse.com/docs/langchain",
    icon: LogOut,
  },
  // {
  //   name: "Delete Account",
  //   description: "Custom integration",
  //   href: "https://langfuse.com/docs/reference",
  //   icon: Code,
  // },
];

export default function UserSettingPage() {
  //   const router = useRouter();
  //   const projectId = router.query.projectId as string;
  const session = useSession()
  console.log(session)






  return (
    <div className="md:container">
      <Header title="User Settings" />
     

      <Alert>
        <div className=" flex justify-between items-center ">

          <div className="text-2xl font-bold">{session.data?.user?.name}</div>


          <Avatar className="h-20 w-20">
            <AvatarImage
              src={session.data?.user?.image ?? undefined}
            />
            <AvatarFallback className="h-20 w-20 text-2xl">
              {session.data?.user?.name
                ? session.data.user.name
                  .split(" ")
                  .map((word) => word[0])
                  .slice(0, 2)
                  .concat("")
                : null}
            </AvatarFallback>
          </Avatar>
        </div>
       

        <ul
          role="list"
          className="mt-6 divide-y divide-gray-200 border-b border-t border-gray-200"
        >
          {instructionItems.map((item, itemIdx) => (
            <li key={itemIdx}>
              <div className="group relative flex items-start space-x-3 py-4">
                <div className="flex-shrink-0">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600">
                    <item.icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                </div>
                <div className="min-w-0 flex-1 items-center">
                  <div className="text-sm font-medium text-gray-900">
                    <a href={item.href} target="_blank">
                      <span className="absolute inset-0" aria-hidden="true" />
                      {item.name}
                    </a>
                  </div>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
                <div className="flex-shrink-0 self-center">
                  <ChevronRightIcon
                    className="h-5 w-5 text-gray-400 group-hover:text-gray-500"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </li>
          ))}
          {/* <Button
          variant="destructive"
          size="sm"
    
        >hellow</Button> */}
        </ul>
      </Alert>
    </div>
  );
}




// const dashboards = [
//   {
//     title: "Usage",
//     description: "Break down llm usage by project, observation, and user.",
//     dashboardUrl:
//       "https://lookerstudio.google.com/embed/reporting/434d92a5-cdbd-4835-b5c6-4a8590924e1d/page/p_refqjqlv7c",
//     dashboardProjectUrl: (projectId: string) =>
//       `https://lookerstudio.google.com/embed/reporting/434d92a5-cdbd-4835-b5c6-4a8590924e1d/page/p_refqjqlv7c?params=%7B%22df14%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580${projectId}%22%7D`,
//   },
//   {
//     title: "Latency",
//     description: "Break down llm latency by project, observation, and user.",
//     dashboardUrl:
//       "https://lookerstudio.google.com/embed/reporting/826764d4-bf63-41d1-b461-fb791f0f0164/page/p_vf8v1b227c",
//     dashboardProjectUrl: (projectId: string) =>
//       `https://lookerstudio.google.com/embed/reporting/826764d4-bf63-41d1-b461-fb791f0f0164/page/p_vf8v1b227c?params=%7B%22df5%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580${projectId}%22%7D`,
//   },
// ] as const;

// const DashboardEmbed = (props: { projectId: string }) => {
//   const router = useRouter();
//   const initialTab = router.query.dashboard as string | undefined;
//   const [activeTab, setActiveTab] = useState(initialTab || dashboards[0].title);

//   const handleTabChange = (value: string) => {
//     //update the state
//     setActiveTab(value);
//     // update the URL query parameter
//     void router.push({
//       query: { dashboard: value },
//       pathname: window.location.pathname,
//     });
//   };

//   // if the query parameter changes, update the state
//   useEffect(() => {
//     setActiveTab(router.query.dashboard as string);
//   }, [router.query.dashboard]);

//   return (
//     <>
//       <Alert>
//         <Construction className="h-4 w-4" />
//         <AlertTitle>You are part of the closed alpha</AlertTitle>
//         <AlertDescription>
//           Please reach out if you have any problems or additional analytics
//           needs. If you cannot access the Looker-powered dashboards, signing
//           into your Google Account on another tab might help. A version for
//           smaller screens is not yet available.
//         </AlertDescription>
//       </Alert>
//       <Tabs
//         defaultValue={dashboards[0].title}
//         value={activeTab}
//         onValueChange={handleTabChange}
//         className="pt-10"
//       >
//         <TabsList>
//           {dashboards.map((dashboard) => (
//             <TabsTrigger key={dashboard.title} value={dashboard.title}>
//               {dashboard.title}
//             </TabsTrigger>
//           ))}
//         </TabsList>
//         {dashboards.map((dashboard) => (
//           <TabsContent key={dashboard.title} value={dashboard.title}>
//             <Card>
//               <CardHeader>
//                 <CardTitle>{dashboard.title}</CardTitle>
//                 <CardDescription>{dashboard.description}</CardDescription>
//               </CardHeader>
//               <CardContent className="space-y-2">
//                 <iframe
//                   width="100%"
//                   src={
//                     process.env.NEXT_PUBLIC_HOSTNAME === "cloud.langfuse.com"
//                       ? dashboard.dashboardProjectUrl(props.projectId)
//                       : dashboard.dashboardUrl
//                   }
//                   className="mt-5 aspect-[1.1]"
//                 />
//               </CardContent>
//             </Card>
//           </TabsContent>
//         ))}
//       </Tabs>
//     </>
//   );
// };
