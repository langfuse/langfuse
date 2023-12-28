import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/ui/alert";
import { useSession, signOut } from "next-auth/react";
import { LogOut, KeySquare } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import { TokenVerification } from "@/src/features/auth/components/TokenVerification";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { api } from "@/src/utils/api";
import UserSettingsCTA from "@/src/features/auth/components/UserSettingsCTA";

export default function UserSettingPage() {
  const session = useSession();
  const [isFormVisible, setFormVisible] = useState(false);

  const getInitials = () => {
    return session.data?.user?.name
      ? session.data.user.name
          .split(" ")
          .map((word) => word[0])
          .slice(0, 2)
          .join("")
      : null;
  };

  const utils = api.useUtils();
  const mutCreateProjectMember = api.users.saveToken.useMutation({
    onSuccess: () => utils.users.invalidate(),
  });

  const generateTokenAndSave = async () => {
    const token = uuidv4();
    const email = String(session.data?.user?.email);
    setFormVisible(true);
    try {
      await mutCreateProjectMember.mutateAsync({
        email: email,
        token: token,
      });
    } catch (err) {
      console.log(err);
    }
  };

  const instructionItems = [
    {
      name: "Change Password",
      description: "Want to change your password?",
      onClick: () => generateTokenAndSave(),
      icon: KeySquare,
      dialog: isFormVisible && <TokenVerification />,
    },
    {
      name: "LogOut",
      description: "Click button to safely end your current session now",
      onClick: () =>
        signOut({
          callbackUrl: "/auth/sign-in",
        }),
      icon: LogOut,
      dialog: <></>,
    },
  ];

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
          {instructionItems.map((item, itemIdx) => (
            <UserSettingsCTA key={itemIdx} item={item} />
          ))}
        </ul>
      </Alert>
    </div>
  );
}
