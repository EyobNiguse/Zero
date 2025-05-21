import { PurpleThickCheck, ThickCheck } from '../icons/icons';
import { useSession, signIn } from '@/lib/auth-client';
import { PricingSwitch } from '../ui/pricing-switch';
import { useBilling } from '@/hooks/use-billing';
import { useNavigate } from 'react-router';
import { Badge } from '../ui/badge';
import { useState } from 'react';
import { toast } from 'sonner';

const handleGoogleSignIn = (
  callbackURL: string,
  options?: { loading?: string; success?: string },
) => {
  return toast.promise(
    signIn.social({
      provider: 'google',
      callbackURL,
    }),
    {
      success: options?.success || 'Redirecting to login...',
      error: 'Login redirect failed',
    },
  );
};

export default function PricingCard() {
  const [isAnnual, setIsAnnual] = useState(false);
  const monthlyPrice = 20;
  const annualPrice = monthlyPrice * 0.5;
  const { attach } = useBilling();
  const { data: session } = useSession();
  const navigate = useNavigate();

  const handleUpgrade = async () => {
    if (!session) {
      handleGoogleSignIn(`${window.location.origin}/pricing`);
      return;
    }

    if (attach) {
      toast.promise(
        attach({
          productId: isAnnual ? 'pro_annual' : 'pro-example',
          successUrl: `${window.location.origin}/mail/inbox?success=true`,
        }),
        {
          success: 'Redirecting to payment...',
          error: 'Failed to process upgrade. Please try again later.',
        },
      );
    }
  };
  return (
    <div>
      <div className="relative z-20 mb-8 flex items-center justify-center gap-2">
        <PricingSwitch onCheckedChange={(checked) => setIsAnnual(checked)} />
        <p className="text-sm text-white/70">Billed Annually</p>
        <Badge className="border border-[#656565] bg-[#3F3F3F] text-white">Save 50%</Badge>
      </div>
      <div className="flex flex-col items-center justify-center gap-5 md:flex-row">
        <div className="relative inline-flex h-[535px] w-96 flex-col items-start justify-start overflow-hidden rounded-2xl border border-[#2D2D2D] bg-zinc-900/50 p-5">
          <div className="absolute inset-0 z-0 h-full w-full overflow-hidden"></div>

          <div className="relative bottom-[-5] z-10 flex flex-col items-start justify-start gap-5 self-stretch lg:bottom-0">
            <div className="flex flex-col items-start justify-start gap-4 self-stretch">
              <div className="inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-lg bg-[#422F10] p-2">
                <div className="relative h-6 w-6">
                  <img
                    src="lock.svg"
                    alt="lock"
                    height={24}
                    width={24}
                    className="relative left-0 h-6 w-6"
                  />
                </div>
              </div>

              <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                <div className="inline-flex items-end justify-start gap-1 self-stretch">
                  <div className="justify-center text-4xl font-semibold leading-10 text-white">
                    Free
                  </div>
                </div>
                <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                  <div className="justify-center self-stretch text-sm font-normal leading-normal text-white opacity-70 lg:text-base">
                    Start with the essentials — ideal for personal use and light email
                    workflows.{' '}
                  </div>
                </div>
              </div>
            </div>
            <div className="h-0 self-stretch outline outline-1 outline-offset-[-0.50px] outline-white/10"></div>
            <div className="flex flex-col items-start justify-start gap-2.5 self-stretch">
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <ThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  One email connection{' '}
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <ThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  AI-powered chat with your inbox{' '}
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <ThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  Basic labeling{' '}
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <ThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  Limited AI email writing{' '}
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              if (session) {
                navigate('/mail/inbox');
              } else {
                handleGoogleSignIn(`${window.location.origin}/mail`, {
                  loading: undefined,
                  success: undefined,
                });
              }
            }}
            className="relative top-[154px] inline-flex h-10 items-center justify-center gap-2.5 self-stretch overflow-hidden rounded-lg bg-[#2D2D2D] p-3 shadow shadow-black/30 outline outline-1 outline-offset-[-1px] outline-[#434343] lg:top-[138px]"
          >
            <div className="flex items-center justify-center gap-2.5 px-1">
              <div className="justify-start text-center font-semibold leading-none text-[#D5D5D5]">
                Get Started For Free
              </div>
            </div>
          </button>
        </div>
        <div className="gap- relative inline-flex h-[535px] w-96 flex-col items-start justify-start overflow-hidden rounded-2xl border border-[#2D2D2D] bg-zinc-900/50 p-5 outline outline-2 outline-offset-[3.5px] outline-[#2D2D2D]">
          <div className="absolute inset-0 z-0 h-full w-full overflow-hidden">
            <img
              src="/pricing-gradient.png"
              alt="pricing-gradient"
              className="absolute -right-0 -top-52 h-auto w-full"
              height={535}
              width={535}
              loading="eager"
            />
          </div>

          <div className="relative bottom-[-5] z-10 flex flex-col items-start justify-start gap-5 self-stretch lg:bottom-0">
            <div className="flex flex-col items-start justify-start gap-4 self-stretch">
              <div className="inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-lg bg-[#422F10] p-2">
                <div className="relative h-6 w-6">
                  <img
                    src="lock.svg"
                    alt=""
                    height={24}
                    width={24}
                    className="relative left-0 h-6 w-6"
                  />
                </div>
              </div>

              <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                <div className="inline-flex items-end justify-start gap-1 self-stretch">
                  <div className="justify-center text-4xl font-semibold leading-10 text-white">
                    Free
                  </div>
                </div>
                <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                  <div className="justify-center self-stretch text-sm font-normal leading-normal text-white opacity-70 lg:text-base">
                    Start with the essentials — ideal for personal use and light email
                    workflows.{' '}
                  </div>
                </div>
              </div>
            </div>
            <div className="h-0 self-stretch outline outline-1 outline-offset-[-0.50px] outline-white/10"></div>
            <div className="flex flex-col items-start justify-start gap-2.5 self-stretch">
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <ThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  One email connection{' '}
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <ThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  AI-powered chat with your inbox{' '}
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <ThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  Basic labeling{' '}
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <ThickCheck className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-sm font-normal leading-normal text-white lg:text-base">
                  Limited AI email writing{' '}
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              if (session) {
                // User is logged in, redirect to inbox
                navigate('/mail/inbox');
              } else {
                // User is not logged in, show sign-in dialog
                toast.promise(
                  signIn.social({
                    provider: 'google',
                    callbackURL: `${window.location.origin}/mail`,
                  }),
                  {
                    error: 'Login redirect failed',
                  },
                );
              }
            }}
            className="relative top-[154px] inline-flex h-10 items-center justify-center gap-2.5 self-stretch overflow-hidden rounded-lg bg-[#2D2D2D] p-3 shadow shadow-black/30 outline outline-1 outline-offset-[-1px] outline-[#434343] lg:top-[138px]"
          >
            <div className="flex items-center justify-center gap-2.5 px-1">
              <div className="justify-start text-center font-semibold leading-none text-[#D5D5D5]">
                Get Started For Free
              </div>
            </div>
          </button>
        </div>
        <div className="gap- relative inline-flex h-[535px] w-96 flex-col items-start justify-start overflow-hidden rounded-2xl border border-[#2D2D2D] bg-zinc-900/50 p-5 outline outline-2 outline-offset-[3.5px] outline-[#2D2D2D]">
          <div className="absolute inset-0 z-0 h-full w-full overflow-hidden">
            <img
              src="/pricing-gradient.png"
              alt=""
              className="absolute -right-0 -top-52 h-auto w-full"
              height={535}
              width={535}
              loading="eager"
            />
          </div>

          <div className="relative right-5 top-[-70px] h-56 w-[720px]">
            <div className="absolute left-[-157px] top-[-68.43px] h-36 w-[1034px] rounded-full bg-white/10 mix-blend-overlay blur-[100px]" />

            <img
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
                  <img height={24} width={24} src="zap.svg" alt="hi" />
                </div>
              </div>

              <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                <div className="inline-flex items-end justify-start gap-1 self-stretch">
                  <div className="justify-center text-4xl font-semibold leading-10 text-white">
                    ${isAnnual ? annualPrice : monthlyPrice}
                  </div>
                  <div className="flex items-center justify-center gap-2.5 pb-0.5">
                    <div className="justify-center text-sm font-medium leading-tight text-white/40">
                      {isAnnual ? '/MONTH (billed annually)' : '/MONTH'}
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
            className="z-30 inline-flex h-24 cursor-pointer items-center justify-center gap-2.5 self-stretch overflow-hidden rounded-lg bg-white p-3 outline outline-1 outline-offset-[-1px]"
            onClick={handleUpgrade}
          >
            <div className="flex items-center justify-center gap-2.5 px-1">
              <div className="justify-start text-center font-semibold leading-none text-black">
                Get Zero Pro
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
