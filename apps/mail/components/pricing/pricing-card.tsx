import { Badge } from '../ui/badge';
import { PricingSwitch } from '../ui/pricing-switch';
import { useState } from 'react';

export default function PricingCard() {
  const [isAnnual, setIsAnnual] = useState(false);
  const monthlyPrice = 20;
  const annualPrice = monthlyPrice * 0.9; // 10% discount
  return (
    <div>
      <div className="flex items-center justify-center relative z-20 gap-2 mb-8">
        <PricingSwitch onCheckedChange={(checked) => setIsAnnual(checked)} />
        <p className="text-sm text-white/70">Billed Annually</p>
        <Badge className="bg-[#3F3F3F] text-white border border-[#656565]">Saved 10%</Badge>
      </div>
     
      <div className="flex items-center justify-center gap-5">
        <div className="relative inline-flex h-[535px] w-96 flex-col items-start justify-start overflow-hidden rounded-2xl border border-[#2D2D2D] bg-zinc-900/50 p-5">
          <div className="absolute inset-0 z-0 h-full w-full overflow-hidden"></div>

          <div className="bottom- relative z-10 flex flex-col items-start justify-start gap-5 self-stretch">
            <div className="flex flex-col items-start justify-start gap-4 self-stretch">
              <div className="inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-lg bg-[#422F10] p-2">
                <div className="relative h-6 w-6">
                  <img src="lock.svg" alt="" className="relative left-[3px]" />
                </div>
              </div>

              <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                <div className="inline-flex items-end justify-start gap-1 self-stretch">
                  <div className="justify-center text-4xl font-semibold leading-10 text-white">
                    Free
                  </div>
                </div>
                <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                  <div className="justify-center self-stretch text-base font-normal leading-normal text-white opacity-70">
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
                  <img src="check.svg" alt="" className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-base font-normal leading-normal text-white">
                  Basic email connections{' '}
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <img src="check.svg" alt="" className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-base font-normal leading-normal text-white">
                  AI-powered chat with your inbox{' '}
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <img src="check.svg" alt="" className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-base font-normal leading-normal text-white">
                  Basic labeling{' '}
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <img src="check.svg" alt="" className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-base font-normal leading-normal text-white">
                  Limited AI email writing{' '}
                </div>
              </div>
            </div>
          </div>
          <button className="relative top-[138px] inline-flex h-10 items-center justify-center gap-2.5 self-stretch overflow-hidden rounded-lg bg-[#2D2D2D] p-3 shadow shadow-black/30 outline outline-1 outline-offset-[-1px] outline-[#434343]">
            <div className="flex items-center justify-center gap-2.5 px-1">
              <div className="justify-start text-center font-semibold leading-none text-[#D5D5D5]">
                Current Plan
              </div>
            </div>
          </button>
        </div>
        <div className="gap- relative inline-flex h-[535px] w-96 flex-col items-start justify-start overflow-hidden rounded-2xl border border-[#2D2D2D] bg-zinc-900/50 p-5 outline outline-2 outline-offset-[3.5px] outline-[#2D2D2D]">
          <div className="absolute inset-0 z-0 h-full w-full overflow-hidden">
            <img
              src="pricing-gradient.png"
              alt=""
              className="absolute -right-0 -top-52 h-auto w-full"
            />
          </div>

          <div className="relative right-5 top-[-70px] h-56 w-[720px]">
            <div className="absolute left-[-157px] top-[-68.43px] h-36 w-[1034px] rounded-full bg-white/10 mix-blend-overlay blur-[100px]" />
            <img
              className="absolute left-0 top-0 h-56 w-[719.25px] mix-blend-screen"
              src="small-pixel.png"
            />
          </div>
          <div className="relative bottom-8 z-10 flex flex-col items-start justify-start gap-5 self-stretch">
            <div className="flex flex-col items-start justify-start gap-4 self-stretch">
              <div className="inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-lg bg-[#B183FF] p-2">
                <div className="relative h-6 w-6">
                  <img src="zap.svg" alt="" />
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
                  <div className="justify-center self-stretch text-base font-normal leading-normal text-white opacity-70">
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
                  <img src="check.svg" alt="" className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-base font-normal leading-normal text-white">
                  Unlimited email connections
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <img src="check.svg" alt="" className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-base font-normal leading-normal text-white">
                  AI-powered chat with your inbox
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <img src="check.svg" alt="" className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-base font-normal leading-normal text-white">
                  Auto labeling
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <img src="check.svg" alt="" className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-base font-normal leading-normal text-white">
                  One-click AI email writing & replies
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <img src="check.svg" alt="" className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-base font-normal leading-normal text-white">
                  Instant thread AI-generated summaries
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <img src="check.svg" alt="" className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-base font-normal leading-normal text-white">
                  Priority customer support
                </div>
              </div>
              <div className="inline-flex items-center justify-start gap-2.5">
                <div className="flex h-5 w-5 items-start justify-start gap-3 rounded-[125px] bg-white/10 p-[5px]">
                  <img src="check.svg" alt="" className="relative left-[1px] top-[1px]" />
                </div>
                <div className="justify-center text-base font-normal leading-normal text-white">
                  Access to private Discord community
                </div>
              </div>
            </div>
          </div>
          <button className="inline-flex h-32 items-center justify-center gap-2.5 self-stretch overflow-hidden rounded-lg bg-white p-3 outline outline-1 outline-offset-[-1px]">
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
