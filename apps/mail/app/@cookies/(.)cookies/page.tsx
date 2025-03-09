import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import CookieManager from "@/components/cookies/cookie-manager";

export default async function CookieSettingsPage() {
  return (
    <Dialog>
      <DialogTitle>Cookie Settings</DialogTitle>
      <DialogContent>
        <CookieManager />
      </DialogContent>
    </Dialog>
  );
}
