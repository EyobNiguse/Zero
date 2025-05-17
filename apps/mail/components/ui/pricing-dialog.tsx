'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CircleCheck } from '@/components/icons/icons';
import { useBilling } from '@/hooks/use-billing';
import { Button } from '@/components/ui/button';

interface PricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PricingDialog({ open, onOpenChange }: PricingDialogProps) {
  const { attach } = useBilling();

  const handleUpgrade = async () => {
    if (attach) {
      try {
        await attach({
          productId: 'pro-example',
          successUrl: `${window.location.origin}/mail/inbox?success=true`,
          authUrl: `${window.location.origin}/login?redirect=/pricing`,
        });
      } catch (error) {
        console.error('Failed to upgrade:', error);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" showOverlay>
        <DialogHeader>
          <DialogTitle className="text-center text-2xl">Upgrade to Pro</DialogTitle>
        </DialogHeader>
        <div className="relative flex h-full flex-col ">
          <h1 className="mb-4 text-center text-lg font-normal text-white/50">Pro</h1>
          <div className="mb-4 text-center text-2xl font-bold dark:text-white">
            $20 <span className="text-base font-medium">/ mo</span>
          </div>
          <ul className="mb-6 w-full flex-grow space-y-2 text-sm text-left">
            <li className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 fill-[#2FAD71]" /> Unlimited email connections
            </li>
            <li className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 fill-[#2FAD71]" /> Unlimited AI chat
            </li>
            <li className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 fill-[#2FAD71]" /> AI writing assistant
            </li>
            <li className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 fill-[#2FAD71]" /> Unlimited auto labeling
            </li>
            <li className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 fill-[#2FAD71]" /> Unlimited AI thread summaries
            </li>
            <li className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 fill-[#2FAD71]" /> Verified checkmark
            </li>
          </ul>
          <Button className="h-8 w-full" onClick={handleUpgrade}>
            Upgrade Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
