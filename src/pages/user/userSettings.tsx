import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/ui/alert";
import { useSession, signOut } from "next-auth/react";
import { LogOut, KeySquare, ChevronRightIcon } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import { TokenVerification } from "@/src/features/auth/components/TokenVerification";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { api } from "@/src/utils/api";

const instructionItems = [
  {
    name: "LogOut",
    description: "Click button to safely end your current session now",
    onClick: () =>
      signOut({
        callbackUrl: "/auth/sign-in",
      }),
    icon: LogOut,
  },
];

export default function UserSettingPage() {
  const session = useSession();
  const [isFormVisible, setFormVisible] = useState(false);

  const utils = api.useUtils();
  const mutCreateProjectMember = api.users.saveToken.useMutation({
    onSuccess: () => utils.users.invalidate(),
  });

  const generateTokenAndSave = async () => {
    const token = uuidv4();
    const email = String(session.data?.user?.email);
    try {
      await mutCreateProjectMember
        .mutateAsync({
          email: email,
          token: token,
        })
        .then(() => {
          setFormVisible(false);
        });
    } catch (err) {
      console.log(err);
    }
  };

  const getInitials = () => {
    return session.data?.user?.name
      ? session.data.user.name
          .split(" ")
          .map((word) => word[0])
          .slice(0, 2)
          .join("")
      : null;
  };

  return (
    <div className="md:container">
      <Header title="User Settings" />
      <Alert>
        <div className=" flex items-center justify-between ">
          <div className="text-lg font-semibold">
            {session.data?.user?.name}
          </div>
          <Avatar className="h-20 w-20">
            <AvatarImage src={session.data?.user?.image ?? undefined} />
            <AvatarFallback className="h-20 w-20 text-2xl">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
        </div>
        <ul
          role="list"
          className="mt-6 divide-y divide-gray-200 border-b border-t border-gray-200"
        >
          <li
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onClick={generateTokenAndSave}
          >
            <div className="group relative flex items-start space-x-3 py-4">
              <div className="flex-shrink-0">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600">
                  <KeySquare className="h-6 w-6" aria-hidden="true" />
                </span>
              </div>
              <div className="min-w-0 flex-1 items-center">
                <div className="text-base font-medium text-gray-900">
                  Change Password
                  <p className="text-sm text-gray-500">
                    Want to change your password?
                  </p>
                  {isFormVisible && <TokenVerification />}
                </div>
              </div>
              <div className="flex-shrink-0 self-center">
                <ChevronRightIcon
                  className="h-5 w-5 text-gray-400 group-hover:text-gray-500"
                  aria-hidden="true"
                />
              </div>
            </div>
          </li>
          {instructionItems.map((item, itemIdx) => (
            <li key={itemIdx} onClick={() => void item.onClick()}>
              <div className="group relative flex items-start space-x-3 py-4">
                <div className="flex-shrink-0">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600">
                    <item.icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                </div>
                <div className="min-w-0 flex-1 items-center">
                  <div className="text-sm font-medium text-gray-900">
                    <a className="cursor-pointer">
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
        </ul>
      </Alert>
    </div>
  );
}
