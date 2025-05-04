'use client';

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuContent,
  ListItem,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
import {
  ArrowRight,
  ChevronDown,
  CurvedArrow,
  Discord,
  GitHub,
  LinkedIn,
  Twitter,
  Plus,
  Cube,
  MediumStack,
  Clock,
} from '../icons/icons';
import { PixelatedBackground, PixelatedLeft, PixelatedRight } from '@/components/home/pixelated-bg';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Command, Menu } from 'lucide-react';
import { Separator } from '../ui/separator';
import Balancer from 'react-wrap-balancer';
import { useForm } from 'react-hook-form';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { toast } from 'sonner';
import Link from 'next/link';
import React from 'react';
import { z } from 'zod';

const tabs = [
  { label: 'Chat With Your Inbox', value: 'smart-categorization' },
  { label: 'Smart Labels', value: 'ai-features' },
  { label: 'Write Better Emails', value: 'feature-3' },
];

const resources = [
  {
    title: 'GitHub',
    href: 'https://github.com/Mail-0/Zero',
    description: 'Check out our open-source projects and contributions.',
    platform: 'github' as const,
  },
  {
    title: 'Twitter',
    href: 'https://x.com/zerodotemail',
    description: 'Follow us for the latest updates and announcements.',
    platform: 'twitter' as const,
  },
  {
    title: 'LinkedIn',
    href: 'https://www.linkedin.com/company/zerodotemail/',
    description: 'Connect with us professionally and stay updated.',
    platform: 'linkedin' as const,
  },
  {
    title: 'Discord',
    href: 'https://discord.gg/0email',
    description: 'Join our community and chat with the team.',
    platform: 'discord' as const,
  },
];

const aboutLinks = [
  {
    title: 'About',
    href: '/about',
    description: 'Learn more about Zero and our mission.',
  },
  {
    title: 'Privacy',
    href: '/privacy',
    description: 'Read our privacy policy and data handling practices.',
  },
  {
    title: 'Terms of Service',
    href: '/terms',
    description: 'Review our terms of service and usage guidelines.',
  },
];

const betaSignupSchema = z.object({
  email: z.string().email().min(9),
});

export default function HomeContent() {
  const tabRefs = useRef<HTMLButtonElement[]>([]);
  const [glowStyle, setGlowStyle] = useState({ left: 0, width: 0 });
  const [open, setOpen] = useState(false);
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme('dark');
  }, [setTheme]);

  const handleTabChange = useCallback((value: string) => {
    const index = tabs.findIndex((tab) => tab.value === value);
    const tab = tabRefs.current[index];
    if (tab) {
      const rect = tab.getBoundingClientRect();
      const listRect = tab.parentElement?.getBoundingClientRect();
      const offsetLeft = listRect ? rect.left - listRect.left : 0;

      const newWidth = rect.width * 0.9;
      const newLeft = offsetLeft + (rect.width - newWidth) / 2;

      setGlowStyle({ left: newLeft, width: newWidth });
    }
  }, []);

  useEffect(() => {
    if (tabs[0] && tabs[0].value) {
      handleTabChange(tabs[0].value);
    }
  }, [handleTabChange]);

  const IconComponent = {
    github: GitHub,
    twitter: Twitter,
    discord: Discord,
    linkedin: LinkedIn,
  };

  return (
    <main className="relative flex h-full flex-1 flex-col overflow-x-hidden">
      <PixelatedBackground
        className="absolute -top-32 left-1/2 -z-10 h-auto w-screen min-w-[1920px] -translate-x-1/2 object-cover opacity-5"
        style={{ mixBlendMode: 'screen' }}
      />
      {/* Desktop Navigation - Hidden on mobile */}
      <header className="fixed z-50 hidden w-full items-center justify-center px-4 pt-6 md:flex">
        <nav className="border-input/50 bg-popover flex w-full max-w-3xl items-center justify-between gap-2 rounded-xl border-t p-2 px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="relative cursor-pointer">
              <Image src="white-icon.svg" alt="Zero Email" width={22} height={22} />
              <span className="absolute right-0 text-[10px]">beta</span>
            </Link>
            <NavigationMenu>
              <NavigationMenuList className="gap-1">
                <NavigationMenuItem>
                  <NavigationMenuTrigger>Company</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-1 lg:w-[600px]">
                      {aboutLinks.map((link) => (
                        <ListItem key={link.title} title={link.title} href={link.href}>
                          {link.description}
                        </ListItem>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuTrigger>Resources</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                      {resources.map((resource) => (
                        <ListItem
                          key={resource.title}
                          title={resource.title}
                          href={resource.href}
                          platform={resource.platform}
                        >
                          {resource.description}
                        </ListItem>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>
          <div className="flex gap-2">
            <Link href="/login">
              <Button variant="ghost" className="h-8">
                Sign in
              </Button>
            </Link>
            <Link target="_blank" href="https://cal.com/team/0">
              <Button className="h-8 font-medium">Contact Us</Button>
            </Link>
          </div>
        </nav>
      </header>

      {/* Mobile Navigation Sheet */}
      <div className="md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="fixed left-4 top-6 z-50">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] bg-[#111111] sm:w-[400px]">
            <SheetHeader className="flex flex-row items-center justify-between">
              <SheetTitle>
                <Image src="white-icon.svg" alt="Zero Email" width={22} height={22} />
              </SheetTitle>
              <Link href="/login">
                <Button className="w-full">Sign in</Button>
              </Link>
            </SheetHeader>
            <div className="mt-8 flex flex-col space-y-3">
              <div className="space-y-3">
                <h4 className="text-muted-foreground text-sm font-medium">Company</h4>
                {aboutLinks.map((link) => (
                  <Link key={link.title} href={link.href} className="block font-medium">
                    {link.title}
                  </Link>
                ))}
              </div>
              <Link target="_blank" href="https://cal.com/team/0" className="font-medium">
                Contact Us
              </Link>
            </div>
            <Separator className="mt-8" />
            <div className="mt-8 flex flex-row items-center justify-center gap-4">
              {resources.map((resource) => {
                const Icon = IconComponent[resource.platform];
                return (
                  <Link
                    key={resource.title}
                    href={resource.href}
                    className="flex items-center gap-2 font-medium"
                  >
                    {resource.platform && <Icon className="h-5 w-5" />}
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <section className="mt-32 flex flex-col items-center px-4 md:mt-40">
        <div className="border-input/50 mb-6 inline-flex items-center gap-4 rounded-full border border-[#2A2A2A] bg-[#1E1E1E] px-4 py-1 pr-1.5">
          <span className="text-sm">See what's new from 0.email</span>
          <Link
            href="https://x.com/zerodotemail"
            target="_blank"
            className="text-foreground flex items-center gap-1 rounded-full bg-gradient-to-b from-neutral-600 to-neutral-700 px-3 py-1 text-sm"
          >
            <span>Learn More</span>
            <ArrowRight className="ml-1" />
          </Link>
        </div>
        <h1 className="text-center text-4xl font-medium md:text-6xl">
          <Balancer className="mb-3 max-w-[1130px]">
            AI Powered Email, Built to Save You Time
          </Balancer>
        </h1>
        <p className="mx-auto mb-4 max-w-2xl text-center text-base font-medium text-[#B7B7B7] md:text-lg">
          Zero is an AI native email client that manages your inbox, so you don't have to.
        </p>

        <Button className="h-8">
          <Link href="/login">Get Started</Link>
        </Button>
      </section>
      <section className="relative mt-10 hidden flex-col justify-center md:flex">
        <div className="bg-border absolute left-1/2 top-0 h-px w-full -translate-x-1/2 md:container xl:max-w-7xl" />
        <Tabs
          defaultValue="smart-categorization"
          onValueChange={handleTabChange}
          className="flex w-full flex-col items-center gap-0"
        >
          {/* <div className="tabs-container relative hidden w-full max-w-[40rem] justify-center md:flex md:max-w-max">
            <TabsList className="relative h-fit w-full rounded-none bg-transparent pb-0 md:w-auto">
              <div className="bg-border absolute -top-4 left-0 h-[calc(100%+16px)] w-px" />
              <div className="bg-border absolute -top-4 right-0 h-[calc(100%+16px)] w-px" />

              <CustomTabGlow glowStyle={glowStyle} />


              {tabs.map((tab, index) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="relative h-12 w-52 rounded-none !bg-transparent !shadow-none"
                  ref={(el) => {
                    if (el) tabRefs.current[index] = el;
                  }}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div> */}
          <div
            className="relative flex w-full justify-center md:border-t"
            style={{ clipPath: 'inset(0 0 42% 0)' }}
          >
            <div className="container relative md:border-x xl:max-w-7xl">
              <PixelatedLeft
                className="absolute left-0 top-0 -z-10 hidden h-full w-auto -translate-x-full opacity-50 md:block"
                style={{ mixBlendMode: 'screen' }}
              />
              <PixelatedRight
                className="absolute right-0 top-0 -z-10 hidden h-full w-auto translate-x-full opacity-50 md:block"
                style={{ mixBlendMode: 'screen' }}
              />
              <div className="bg-border absolute -left-px -top-4 hidden h-4 w-px md:block" />
              <div className="bg-border absolute -right-px -top-4 hidden h-4 w-px md:block" />
              {tabs.map((tab) => (
                <TabsContent key={tab.value} value={tab.value}>
                  <Image
                    src="/email-preview.png"
                    alt="Zero Email Preview"
                    width={1920}
                    height={1080}
                    className="relative -top-2 hidden md:block"
                    priority
                  />
                </TabsContent>
              ))}
            </div>
          </div>
        </Tabs>
      </section>

      <div className="relative bottom-96 z-[-2]">
        <Image
          src="/pixel.svg"
          alt="hero"
          width={1920}
          height={1080}
          className="relative opacity-70"
        />
        <div className="relative bottom-48">
          <div className="flex items-center justify-center">
            <h1 className="text-xl font-light text-white/40">
              Designed for power users who value time
            </h1>
          </div>
          <div className="mt-8 flex flex-col items-center justify-center">
            <h1 className="text-6xl font-medium text-white">Speed Is Everything</h1>
            <h1 className="text-6xl font-medium text-white/40">Reply in seconds</h1>
          </div>
          <div className="relative bottom-3 flex items-center justify-center">
          <div className="mx-auto inline-flex max-w-[600px] flex-col items-center justify-center overflow-hidden rounded-2xl  bg-[#1A1A1A] shadow-md">
        <div className="inline-flex h-12 items-center justify-start gap-2 self-stretch border-b-[0.50px] p-4">
          <div className="text-base-gray-500/50 justify-start text-sm leading-none">To:</div>
          <div className="flex flex-1 items-center justify-start gap-1">
            <div className="outline-tokens-badge-default/10 flex items-center justify-start gap-1.5 rounded-full py-1 pl-1 pr-1.5 border border-[#2B2B2B]">
              <Image
                height={20}
                width={20}
                className="h-5 w-5 rounded-full"
                src="/adam.jpg"
                alt="Adam"
              />
              <div className="flex items-center justify-start">
                <div className="flex items-center justify-center gap-2.5 pr-0.5">
                  <div className="text-base-gray-950 justify-start text-sm leading-none">Adam</div>
                </div>
              </div>
            </div>
            <div className="outline-tokens-badge-default/10 flex items-center justify-start gap-1.5 rounded-full py-1 pl-1 pr-1.5 border border-[#2B2B2B]">
            <Image
                height={20}
                width={20}
                className="h-5 w-5 rounded-full"
                src="/ryan.jpg"
                alt="Ryan"
              />              <div className="flex items-center justify-start">
                <div className="flex items-center justify-center gap-2.5 pr-0.5">
                  <div className="text-base-gray-950 justify-start text-sm leading-none">Ryan</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="inline-flex h-12 items-center justify-start gap-2.5 self-stretch p-4">
          <Clock className="relative h-3.5 w-3.5 overflow-hidden fill-[#9A9A9A]" />
          <div className="inline-flex flex-1 flex-col items-start justify-start gap-3">
            <div className="inline-flex items-center justify-start gap-1 self-stretch">
              <div className="text-base-gray-950 flex-1 justify-start text-sm font-normal leading-none">
                Re: Code review feedback
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start justify-start gap-12 self-stretch rounded-2xl bg-[#202020] px-4 py-3">
          <div className="flex flex-col items-start justify-start gap-3 self-stretch">
            <div className="text-white justify-start self-stretch text-sm font-normal leading-normal">
              Hey team,
            </div>
            <div className="text-white justify-start self-stretch text-sm font-normal leading-normal">
              I took a look at the code review feedback. Really like the keyboard navigation - it
              makes everything much faster to access. The search implementation is clean, though I'd
              love to see the link to test it out myself.
            </div>
            <div className="text-white justify-start self-stretch text-sm font-normal leading-normal">
              Let me know when you can share the preview and I'll provide more detailed feedback.
            </div>
          </div>
          <div className="inline-flex items-center justify-between self-stretch">
            <div className="flex items-center justify-start gap-3">
              <div className="flex items-center justify-start rounded-md bg-white text-black">
                <div className="flex h-7 items-center justify-center gap-1.5 overflow-hidden rounded-bl-md rounded-tl-md bg-white pl-1.5 pr-1">
                  <div className="flex items-center justify-center gap-2.5 pl-0.5">
                    <div className="text-black justify-start text-center text-sm leading-none">
                      Send now
                    </div>
                  </div>
                  <div className="flex h-5 items-center justify-center gap-2.5 rounded bg-[#E7E7E7] px-1 outline outline-1 outline-offset-[-1px] outline-[#D2D2D2]">
                    <div className="text-tokens-shortcut-primary-symbol justify-start text-center text-sm font-semibold leading-none">
                      ⏎
                    </div>
                  </div>
                </div>
                <div className="bg-base-gray-950 flex items-center justify-start gap-2.5 self-stretch px-2 pr-3">
                  <div className="relative h-3 w-px rounded-full bg-[#D0D0D0]" />
                </div>
                <div className="bg-base-gray-950 flex h-7 items-center justify-center gap-1.5 overflow-hidden rounded-br-md rounded-tr-md pr-2">
                  <ChevronDown className="relative h-2 w-2 overflow-hidden fill-black" />
                </div>
              </div>
              <div className="flex h-7 items-center justify-center gap-0.5 overflow-hidden rounded-md bg-[#373737] px-1.5">
                <Plus className="relative h-2.5 w-2.5 overflow-hidden fill-[#9A9A9A]" />
                <div className="flex items-center justify-center gap-2.5 px-0.5">
                  <div className="text-base-gray-950 justify-start text-sm leading-none">
                    Add files
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-start justify-start gap-3">
              <div className="flex h-7 items-center justify-center gap-0.5 overflow-hidden rounded-md bg-[#373737] px-1.5">
                <Cube className="relative h-3 w-3 overflow-hidden fill-[#9A9A9A]" />

                <div className="flex items-center justify-center gap-2.5 px-0.5">
                  <div className="text-base-gray-950 justify-start text-sm leading-none">
                    Neutral
                  </div>
                </div>
              </div>
              <div className="flex h-7 items-center justify-center gap-0.5 overflow-hidden rounded-md bg-[#373737] px-1.5">
                <MediumStack className="relative h-2.5 w-2.5 overflow-hidden fill-[#9A9A9A] mx-1" />

                <div className="flex items-center justify-center gap-2.5 px-0.5">
                  <div className="text-base-gray-950 justify-start text-sm leading-none">
                    Medium-length
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="inline-flex items-start justify-start self-stretch">
          <div className="border-tokens-stroke-light/5 flex h-12 flex-1 items-center justify-center gap-2 border-r-[0.50px]">
            <div className="flex items-center justify-start gap-1">
              <div className="bg-[#2B2B2B] flex h-5 w-5 items-center justify-center gap-2.5 rounded-[5px] px-1.5">
                <div className="text-[#8C8C8C] justify-start text-center text-sm font-semibold leading-none">
                  ↓
                </div>
              </div>
              <div className="bg-[#2B2B2B] flex h-5 w-5 items-center justify-center gap-2.5 rounded-[5px] px-1.5">
                <div className="text-[#8C8C8C] justify-start text-center  text-sm font-semibold leading-none">
                  ↑
                </div>
              </div>
            </div>
            <div className="text-[#8C8C8C] justify-start text-sm leading-none">
              to navigate
            </div>
          </div>
          <div className="flex h-12 flex-1 items-center justify-center gap-2">
            <div className="bg-[#2B2B2B] flex h-5 items-center justify-center gap-2.5 rounded-[5px] px-1">
              <div className="text-[#8C8C8C] justify-start text-center text-sm font-semibold leading-none">
                ⌘Z
              </div>
            </div>
            <div className="text-[#8C8C8C] justify-start text-sm leading-none">
              return generation
            </div>
          </div>
        </div>
      </div>
          </div>
        </div>
      </div>

      <div className="relative bottom-96 bg-[#111111]">
        <div className="items-center justify-center gap-8 md:flex">
          <div className="flex flex-col">
            <Image src="/mail-list.png" alt="speed" width={400} height={800} className="mb-4" />
            <div className="gap-4">
              <h1 className="mb-2 text-xl font-medium leading-loose text-white">
                Lightning-Fast Interface
              </h1>
              <p className="max-w-sm text-sm font-light text-white">
                Email at the speed of thought. Navigate your entire inbox using just your keyboard.
                Process hundreds of emails in minutes.
              </p>
            </div>
          </div>
          <div>
            <Image src="/ai-summary.png" alt="speed" width={400} height={800} className="mb-4" />
            <div>
              <h1 className="mb-2 text-lg font-medium leading-loose text-white">
                AI-Powered Summaries
              </h1>
              <p className="max-w-sm text-sm font-light text-white">
                Your personal email copilot. Let our AI draft responses, summarize long threads, and
                extract action items automatically.
              </p>
            </div>
          </div>
          <div className="">
            <Image src="/search.png" alt="speed" width={400} height={800} className="mb-4" />
            <div className="">
              <h1 className="mb-2 text-lg font-medium leading-loose text-white">Smart Search</h1>
              <p className="max-w-sm text-sm font-light text-white">
                Your inbox, your rules. Create personalized email processing flows that match
                exactly how you organize,write, reply, and work.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bottom-70 relative z-[-2]">
        <div className="z-1 relative bottom-48">
          <div className="flex items-center justify-center">
            <h1 className="text-xl font-light text-white/40">
              AI email chat with natural language
            </h1>
          </div>
          <div className="mt-8 flex flex-col items-center justify-center">
            <h1 className="text-6xl font-medium text-white">Ask away</h1>
            <h1 className="text-6xl font-medium text-white/40">Get your answers</h1>
          </div>
          <div className="relative bottom-2 flex items-center justify-center">
            <Image src="/ai-chat.png" alt="speed" width={850} height={800} />
          </div>
          <Image
            src="/pixel.svg"
            alt="hero"
            width={1920}
            height={1080}
            className="relative bottom-16 z-[-2] rotate-180 opacity-70"
            style={{ clipPath: 'inset(45% 0 0 0)' }}
          />
        </div>
      </div>

      <div className="relative bottom-72 z-[-2]">
        <div className="mx-auto max-w-[920px] text-center text-4xl font-normal leading-[48px] text-white">
          <span className="text-[#B7B7B7]">Work smarter, not harder.</span>{' '}
          <span className="pr-8 text-white">Automate repetitive</span>{' '}
          <span className="text-[#B7B7B7]">email</span>
          <span className="text-[#B7B7B7]"> tasks with</span>{' '}
          <span className="pr-8 text-white">smart templates, </span>{' '}
          <span className="text-white">scheduled sends</span>
          <span className="text-[#B7B7B7]">
            , follow-up reminders, and batch processing capabilities that
          </span>{' '}
          <br />
          <span className="text-white underline">save hours every week.</span>
        </div>
        <div className="flex items-center justify-center">
          <Image
            className="relative bottom-12 right-[162px]"
            src="/verified-home.png"
            alt="tasks"
            width={50}
            height={50}
          />
          <Image
            className="relative bottom-[150px] right-[-25px]"
            src="/snooze-home.png"
            alt="tasks"
            width={50}
            height={50}
          />
          <Image
            className="relative bottom-[195px] left-[278px]"
            src="/star-home.png"
            alt="tasks"
            width={50}
            height={50}
          />
        </div>
      </div>
      
    </main>
  );
}

const CustomTabGlow = ({ glowStyle }: { glowStyle: { left: number; width: number } }) => {
  return (
    <div
      className="absolute w-1/3 transition-all duration-300 ease-in-out"
      style={{
        left: `${glowStyle.left}px`,
      }}
    >
      <div
        style={{
          width: `${glowStyle.width}px`,
        }}
        className="bottom-0 h-12 translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.3)_0%,_transparent_70%)] blur-md"
      />
      <div
        style={{ width: `${glowStyle.width}px` }}
        className="bottom-0 h-px rounded-full bg-gradient-to-r from-transparent via-white/90 to-transparent"
      />
    </div>
  );
};
