import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";

import { signOut } from "next-auth/react";

export function PasswordResetSuccess() {
  const [open, setOpen] = useState(true);

  const changeOpenState = () => {
    setOpen(!open);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpenState}>
      <DialogTrigger asChild></DialogTrigger>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogTitle>Password Reset!</DialogTitle>
        <div className="mb-2">
          <div className="text-md font-semibold"></div>
          <div className="my-2">
            We have reset your Password Please Sign-in Again with your New
            Password.
          </div>
          <Button
            onClick={() => {
              void (async () => {
                await signOut({
                  redirect: false,
                  callbackUrl: "/auth/sign-in",
                });
              })();
            }}
          >
            Sign-In
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
