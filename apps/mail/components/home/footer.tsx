'use client';

import { ThemeToggle } from '@/components/theme/theme-toggle';
import { LinkedIn, Twitter, Discord } from '../icons/icons';
import { Github } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const socialLinks = [
  {
    name: 'Twitter',
    href: 'https://x.com/zerodotemail',
    icon: Twitter,
  },
  {
    name: 'LinkedIn',
    href: 'https://linkedin.com/company/zero-email',
    icon: LinkedIn,
  },
  {
    name: 'Discord',
    href: 'https://discord.gg/0email',
    icon: Discord,
  },
];

export default function Footer() {
  return (
    <div className="flex flex-col items-center justify-center">
      <div className='mb-72'>
        {/* <div className="h-[527px] w-screen bg-gradient-to-b from-violet-600 via-orange-400 to-slate-950 blur-2xl" /> */}
        <div className="inline-flex justify-center">
          <div className="inline-flex  relative  flex-col items-center justify-center gap-20 rounded-full ">
            <div className="flex flex-col items-center">
              <div className="flex flex-col items-center  py-5">
                <div className="text-center text-6xl font-bold bg-gradient-to-b from-[#FFFFFF] to-[#1a1a19] inline-block text-transparent bg-clip-text">
                  Experience the Future of <br />
                  Email Today
                </div>
              </div>
              <div className="flex flex-col items-center justify-start">
                <div className="justify-start text-center text-lg font-normal leading-7 text-white">
                  Watch how 0.email helps you process your inbox  in a fraction of the time.
                </div>
              </div>
              <div className="flex w-[644.45px] flex-col items-center justify-center pt-8">
                <Link href="/login" className="inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-lg bg-white p-3.5 cursor-pointer">
                  <div className="flex items-center justify-center gap-2.5 px-1">
                    <div className="justify-start text-center font-['Geist'] text-base font-semibold leading-none text-zinc-950">
                      Get Started
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="relative z-50 mx-auto mb-12 inline-flex max-w-[2900px] flex-col items-start justify-start gap-10 self-stretch">
        <div className="flex items-start justify-between gap-56 md:w-[900px]">
          <div className="inline-flex flex-col items-start justify-between self-stretch">
            <div className="inline-flex w-8 items-center justify-start gap-3">
              <Link href="/">
                <Image src="/white-icon.svg" alt="logo" width={100} height={100} />
              </Link>
            </div>
            <div className="inline-flex items-center justify-start gap-4">
              {socialLinks.map((social) => (
                <Link
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2.5 rounded-[999px] bg-white/10 p-2 backdrop-blur-[20px] transition-colors hover:bg-white/20"
                >
                  <div className="relative h-3.5 w-3.5 overflow-hidden">
                    <social.icon className="absolute h-3.5 w-3.5 fill-white" />
                  </div>
                </Link>
              ))}
            </div>
            {/* <div className="flex items-center justify-start gap-3">
              <div className="justify-start text-base font-normal leading-none text-white opacity-80">
                Backed by
              </div>
              <Link href="https://www.ycombinator.com" target="_blank" rel="noopener noreferrer">
                <div className="relative w-36 overflow-hidden">
                  <Image
                    src="/yc.svg"
                    className="bg-transparent"
                    alt="logo"
                    width={100}
                    height={100}
                  />
                </div>
              </Link>
            </div> */}
          </div>
          <div className="flex flex-1 items-start justify-end gap-10">
            <div className="inline-flex flex-col items-start justify-start gap-5">
              <div className="justify-start self-stretch font-['Inter'] text-sm font-normal text-white/40">
                Product
              </div>
              <div className="flex flex-col items-start justify-start gap-4 self-stretch">
                <Link
                  href="https://x.com/nizzyabi/status/1918064165530550286"
                  className="w-full"
                  target="_blank"
                >
                  <div className="justify-start self-stretch text-base leading-none text-white opacity-80 transition-opacity hover:opacity-100">
                    Product
                  </div>
                </Link>
                <Link
                  href="https://x.com/nizzyabi/status/1918051282881069229"
                  className="w-full"
                  target="_blank"
                >
                  <div className="justify-start self-stretch text-base leading-none text-white opacity-80 transition-opacity hover:opacity-100">
                    Zero AI
                  </div>
                </Link>
                <Link
                  href="https://x.com/nizzyabi/status/1919292505260249486"
                  className="w-full"
                  target="_blank"
                >
                  <div className="justify-start self-stretch text-base leading-none text-white opacity-80 transition-opacity hover:opacity-100">
                    Shortcuts
                  </div>
                </Link>
              </div>
            </div>
            <div className="inline-flex flex-col items-start justify-start gap-5">
              <div className="justify-start self-stretch font-['Inter'] text-sm font-normal text-white/40">
                Company
              </div>
              <div className="flex flex-col items-start justify-start gap-4 self-stretch">
                <Link target="_blank" href="/about" className="w-full">
                  <div className="justify-start self-stretch text-base font-normal leading-none text-white opacity-80 transition-opacity hover:opacity-100">
                    About
                  </div>
                </Link>
                <Link target="_blank" href="https://github.com/Mail-0/Zero" className="w-full">
                  <div className="justify-start self-stretch text-base font-normal leading-none text-white opacity-80 transition-opacity hover:opacity-100">
                    Github
                  </div>
                </Link>
                <Link target="_blank" href="https://x.com/nizzyabi" className="w-full">
                  <div className="justify-start self-stretch text-base font-normal leading-none text-white opacity-80 transition-opacity hover:opacity-100">
                    Content
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className="h-0.5 self-stretch bg-white/20" />
        <div className="flex flex-col items-start justify-start gap-6 self-stretch">
          <div className="inline-flex items-center justify-between self-stretch">
            <div className="justify-start text-sm font-medium leading-tight text-white opacity-80">
              © 2025 Zero Email Inc, All Rights Reserved
            </div>
            <div className="flex items-center justify-start gap-4">
              <Link
                href="/about"
                className="justify-start text-sm font-normal leading-tight text-white/70 opacity-80 transition-opacity hover:opacity-100"
              >
                About
              </Link>
              <div className="h-5 w-0 outline outline-1 outline-offset-[-0.50px] outline-white/20" />

              <Link
                href="/terms"
                className="justify-start text-sm font-normal leading-tight text-white/70 opacity-80 transition-opacity hover:opacity-100"
              >
                Terms & Conditions
              </Link>
              <div className="h-5 w-0 outline outline-1 outline-offset-[-0.50px] outline-white/20" />
              <Link
                href="/privacy"
                className="justify-start text-sm font-normal leading-tight text-white/70 opacity-80 transition-opacity hover:opacity-100"
              >
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
