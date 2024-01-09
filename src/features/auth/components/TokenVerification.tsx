import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";

export function TokenVerification() {
  const [open, setOpen] = useState(true);

  const changeOpenState = () => {
    setOpen(!open);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpenState}>
      <DialogTrigger asChild></DialogTrigger>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogTitle>Token Verification</DialogTitle>
        <div className="mb-2">
          <div className="text-md font-semibold"></div>
          <div className="my-2">
            We have sent you a Link on your{" "}
            <span className="font-semibold">Registered Email ID</span>. Please
            Open the Link to continue resetting your password.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
