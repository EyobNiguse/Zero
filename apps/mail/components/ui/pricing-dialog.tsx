'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CircleCheck, PurpleThickCheck } from '@/components/icons/icons';
import { useBilling } from '@/hooks/use-billing';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

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
      <DialogContent
        className="flex items-center justify-center border-none dark:bg-transparent"
        showOverlay
      >
        <DialogTitle className="text-center text-2xl"></DialogTitle>

        <div className="relative inline-flex h-[535px] w-96 flex-col items-center justify-center overflow-hidden rounded-2xl border border-[#2D2D2D] bg-zinc-900/50 p-5 outline outline-2 outline-offset-[3.5px] outline-[#2D2D2D]">
          <div className="absolute inset-0 z-0 h-full w-full overflow-hidden">
            <Image
              src="/pricing-gradient.png"
              alt=""
              className="absolute -right-0 -top-52 h-auto w-full"
              height={535}
              width={535}
            />
          </div>

          <div className="relative right-5 top-[-70px] h-56 w-[720px]">
            <div className="absolute left-[-157px] top-[-68.43px] h-36 w-[1034px] rounded-full bg-white/10 mix-blend-overlay blur-[100px]" />

            <Image
              className="absolute left-0 top-0 h-56 w-[719.25px] mix-blend-screen"
              src="/small-pixel.png"
              height={56}
              width={719}
              alt="small-pixel"
            />
          </div>
          <div className="relative bottom-[50px] z-10 flex flex-col items-start justify-start gap-5 self-stretch md:bottom-[55px] lg:bottom-[37px]">
            <div className="flex flex-col items-start justify-start gap-4 self-stretch">
              <div className="inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-lg bg-[#B183FF] p-2">
                <div className="relative h-6 w-6">
                  <Image height={24} width={24} src="/zap.svg" alt="hi" />
                </div>
              </div>

              <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                <div className="inline-flex items-end justify-start gap-1 self-stretch">
                  <div className="justify-center text-4xl font-semibold leading-10 text-white">
                    $20
                  </div>
                  <div className="flex items-center justify-center gap-2.5 pb-0.5">
                    <div className="justify-center text-sm font-medium leading-tight text-white/40">
                      /MONTH
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                  <div className="justify-center self-stretch text-sm font-normal leading-normal text-white opacity-70 lg:text-base">
                    For professionals and power users who want to supercharge their inbox
                    efficiency.
                  </div>
                </div>
              </div>
            </div>
            <div className="h-0 self-stretch outline outline-1 outline-offset-[-0.50px] outline-white/10"></div>
            <div className="flex flex-col items-start justify-start gap-2.5 self-stretch">
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <PurpleThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  Unlimited email connections
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <PurpleThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  AI-powered chat with your inbox
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <PurpleThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  Auto labeling
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <PurpleThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  One-click AI email writing & replies
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <PurpleThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  Instant thread AI-generated summaries
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <PurpleThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  Priority customer support
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <PurpleThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  Access to private Discord community
                </div>
              </div>
            </div>
          </div>
          <button
            className="z-50 inline-flex h-24 cursor-pointer items-center justify-center gap-2.5 self-stretch overflow-hidden rounded-lg bg-white p-3 outline outline-1 outline-offset-[-1px]"
            onClick={handleUpgrade}
          >
            <div className="flex items-center justify-center gap-2.5 px-1">
              <div className="justify-start text-center font-semibold leading-none text-black">
                Get Zero Pro
              </div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
