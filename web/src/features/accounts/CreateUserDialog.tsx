import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { DialogHeader } from "@/src/components/ui/dialog";
import { DialogTitle } from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Checkbox } from "@/src/components/ui/checkbox";
import { api } from "@/src/utils/api";
import { Plus } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";

export function CreateUserDialog() {
  const router = useRouter();

  const utils = api.useUtils();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isGbaUser, setIsGbaUser] = useState(false);
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const projectId = router.query.projectId as string;

  const createUser = api.accounts.createUser.useMutation({
    onSuccess: () => {
      toast.success("User created");
      utils.accounts.getUsers.invalidate();
      setIsOpen(false);
      setEmail("");
      setName("");
      setPassword("");
      setIsGbaUser(false);
      setPaymentRequired(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim() || !password.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }
    createUser.mutate({
      email: email.trim(),
      name: name.trim(),
      password: password.trim(),
      projectId: projectId,
      isGbaUser: isGbaUser,
      paymentRequired: paymentRequired,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={createUser.isLoading}
          variant="outline"
          className="gap-1 bg-pink-600 text-white"
        >
          <Plus size={12} />
          Add User
        </Button>
      </DialogTrigger>
      <DialogContent closeOnInteractionOutside>
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 py-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email"
              disabled={createUser.isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter name"
              disabled={createUser.isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={createUser.isLoading}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="gba-user"
              checked={isGbaUser}
              onCheckedChange={(checked) => setIsGbaUser(checked === true)}
              disabled={createUser.isLoading}
            />
            <Label htmlFor="gba-user">GBA user?</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="payment-required"
              checked={paymentRequired}
              onCheckedChange={(checked) =>
                setPaymentRequired(checked === true)
              }
              disabled={createUser.isLoading}
            />
            <Label htmlFor="payment-required">Payment Required</Label>
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={createUser.isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createUser.isLoading}>
              {createUser.isLoading ? "Creating..." : "Create User"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
