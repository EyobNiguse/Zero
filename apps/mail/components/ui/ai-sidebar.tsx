'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useState, useEffect, useContext, createContext, useCallback, useMemo, useRef } from 'react';
import { AI_SIDEBAR_COOKIE_NAME, SIDEBAR_COOKIE_MAX_AGE } from '@/lib/constants';
import { StyledEmailAssistantSystemPrompt, AiChatPrompt } from '@/lib/prompts';
import { useEditor } from '@/components/providers/editor-provider';
import { AIChat } from '@/components/create/ai-chat';
import { useChat } from '@ai-sdk/react';
import { X, Paper } from '@/components/icons/icons';
import { GitBranchPlus, Plus } from 'lucide-react';
import { useBilling } from '@/hooks/use-billing';
import { Button } from '@/components/ui/button';
import { useHotkeys } from 'react-hotkeys-hook';
import { Gauge } from '@/components/ui/gauge';
import { usePathname, useSearchParams, useParams } from 'next/navigation';
import { useCustomer } from 'autumn-js/next';
import { getCookie } from '@/lib/utils';
import { Textarea } from './textarea';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import Image from 'next/image';
import { env } from '@/lib/env';
import { toast } from 'sonner';

interface AISidebarProps {
  className?: string;
}

type AISidebarContextType = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
};

export const AISidebarContext = createContext<AISidebarContextType | undefined>(undefined);

export function useAISidebar() {
  const context = useContext(AISidebarContext);
  if (!context) {
    throw new Error('useAISidebar must be used within an AISidebarProvider');
  }
  return context;
}

export function AISidebarProvider({ children }: { children: React.ReactNode }) {
  // Initialize state from cookie
  const [open, setOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const aiSidebarCookie = getCookie(AI_SIDEBAR_COOKIE_NAME);
      return aiSidebarCookie ? aiSidebarCookie === 'true' : false;
    }
    return false;
  });

  const toggleOpen = () => setOpen((prev) => !prev);

  // Save state to cookie when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.cookie = `${AI_SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    }
  }, [open]);

  return (
    <AISidebarContext.Provider value={{ open, setOpen, toggleOpen }}>
      <AISidebar>{children}</AISidebar>
    </AISidebarContext.Provider>
  );
}

export function AISidebar({ children, className }: AISidebarProps & { children: React.ReactNode }) {
  const { open, setOpen } = useAISidebar();
  const [resetKey, setResetKey] = useState(0);
  const pathname = usePathname();
  const params = useSearchParams();
  const { folder } = useParams<{ folder: string }>();
  const { chatMessages, attach, customer } = useBilling();
  
  // Initialize shared chat state that will be used by both desktop and mobile views
  // This ensures conversation continuity when switching between viewport sizes
  const chatState = useChat({
    api: `${env.NEXT_PUBLIC_BACKEND_URL}/api/chat`,
    fetch: (url, options) => fetch(url, { ...options, credentials: 'include' }),
    maxSteps: 5,
    body: {
      threadId: params.get('threadId') ?? undefined,
      currentFolder: folder ?? undefined,
      currentFilter: params.get('q') ?? undefined,
    },
    onError(error) {
      console.error('Error in useChat', error);
      toast.error('Error, please try again later');
    },
    onResponse: (response) => {
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
    },
  });

  const isPro = useMemo(() => {
    return (
      customer &&
      Array.isArray(customer.products) &&
      customer.products.some(
        (product: any) =>
          product.id.includes('pro-example') || product.name.includes('pro-example'),
      )
    );
  }, [customer]);

  const handleUpgrade = async () => {
    if (attach) {
      return attach({
        productId: 'pro-example',
        successUrl: `${window.location.origin}/mail/inbox?success=true`,
      })
        .catch((error: Error) => {
          console.error('Failed to upgrade:', error);
        })
        .then(() => {
          console.log('Upgraded successfully');
        });
    }
  };

  useHotkeys('Meta+0', () => {
    setOpen(!open);
  });

  useHotkeys('Control+0', () => {
    setOpen(!open);
  });

  const handleNewChat = useCallback(() => {
    setResetKey((prev) => prev + 1);
  }, []);

  // Only show on /mail pages
  const isMailPage = pathname?.startsWith('/mail');
  const searchParams = useSearchParams();
  const previousPathRef = useRef(pathname);
  const previousSearchParamsRef = useRef(searchParams.toString());
  
  // Close the popup when URL changes in any way (path or search params)
  useEffect(() => {
    const currentPath = pathname;
    const currentSearchParams = searchParams.toString();
    
    // Check if we're on small screens and if the URL has changed in any way
    if (open && 
        (previousPathRef.current !== currentPath || 
         previousSearchParamsRef.current !== currentSearchParams)) {
      // Only close if we're on small screens (sm or smaller)
      if (typeof window !== 'undefined' && window.innerWidth < 640) {
        setOpen(false);
      }
    }
    
    // Update refs with current values
    previousPathRef.current = currentPath;
    previousSearchParamsRef.current = currentSearchParams;
  }, [pathname, searchParams, open, setOpen]);
  
  if (!isMailPage) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        className={cn('bg-lightBackground dark:bg-darkBackground p-0')}
      >
        <ResizablePanel>{children}</ResizablePanel>
        <ResizableHandle className="opacity-0" />
        {open && (
          <>
            {/* Desktop sidebar - only visible on lg screens */}
            <ResizablePanel
              defaultSize={20}
              minSize={20}
              maxSize={35}
              className="bg-panelLight dark:bg-panelDark mr-1.5 mt-1 h-[calc(98vh+12px)] border-[#E7E7E7] shadow-sm md:rounded-2xl md:border md:shadow-sm dark:border-[#252525] hidden xl:block"
            >
              <div className={cn('h-[calc(98vh+15px)]', 'flex flex-col', '', className)}>
                <div className="flex h-full flex-col">
                  <div className="relative flex items-center justify-between border-b border-[#E7E7E7] px-2.5 pb-2.5 pt-[17.6px] dark:border-[#252525]">
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => setOpen(false)}
                            variant="ghost"
                            className="md:h-fit md:px-2"
                          >
                            <X className="dark:fill-iconDark fill-iconLight" />
                            <span className="sr-only">Close chat</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Close chat</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <div className="flex items-center gap-2">
                      {!isPro && (
                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild className="md:h-fit md:px-2">
                              <div>
                                <Gauge
                                  value={50 - chatMessages.remaining!}
                                  size="small"
                                  showValue={true}
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                You've used {50 - chatMessages.remaining!} out of 50 chat messages.
                              </p>
                              <p className="mb-2">Upgrade for unlimited messages!</p>
                              <Button onClick={handleUpgrade} className="h-8 w-full">
                                Upgrade
                              </Button>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      <TooltipProvider delayDuration={0}>
                        <Dialog>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DialogTrigger asChild>
                                <Button variant="ghost" className="md:h-fit md:px-2 [&>svg]:size-3">
                                  <Paper className="dark:fill-iconDark fill-iconLight h-3.5 w-3.5" />
                                </Button>
                              </DialogTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Prompts</TooltipContent>
                          </Tooltip>
                          <DialogContent showOverlay={true}>
                            <DialogHeader>
                              <DialogTitle>AI System Prompts</DialogTitle>
                              <DialogDescription>
                                We believe in Open Source, so we're open sourcing our AI system
                                prompts. Soon you will be able to customize them to your liking. For
                                now, here are the default prompts:
                              </DialogDescription>
                            </DialogHeader>
                            <div className="text-muted-foreground mb-1 mt-4 flex gap-2 text-sm">
                              <span>Zero Chat / System Prompt</span>
                              <Link
                                href={'https://github.com/Mail-0/Zero.git'}
                                target="_blank"
                                className="flex items-center gap-1 underline"
                              >
                                <span>Contribute</span>
                                <GitBranchPlus className="h-4 w-4" />
                              </Link>
                            </div>
                            <Textarea
                              className="min-h-60"
                              readOnly
                              value={AiChatPrompt('', '', '')}
                            />
                            <div className="text-muted-foreground mb-1 mt-4 flex gap-2 text-sm">
                              <span>Zero Compose / System Prompt</span>
                              <Link
                                href={'https://github.com/Mail-0/Zero.git'}
                                target="_blank"
                                className="flex items-center gap-1 underline"
                              >
                                <span>Contribute</span>
                                <GitBranchPlus className="h-4 w-4" />
                              </Link>
                            </div>
                            <Textarea
                              className="min-h-60"
                              readOnly
                              value={StyledEmailAssistantSystemPrompt().trim()}
                            />
                          </DialogContent>
                        </Dialog>
                      </TooltipProvider>

                      <TooltipProvider delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={handleNewChat}
                              variant="ghost"
                              className="md:h-fit md:px-2"
                            >
                              <Plus className="dark:text-iconDark text-iconLight" />
                              <span className="sr-only">New chat</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>New chat</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  <div className="b relative flex-1 overflow-hidden">
                    <AIChat 
                      key={resetKey} 
                      {...chatState} 
                      // Pass the chat state to preserve conversation when switching between desktop/mobile
                    />
                  </div>
                </div>
              </div>
            </ResizablePanel>
            {/* Mobile popup - only visible on smaller screens */}
            <div className="fixed z-50 xl:hidden backdrop-blur-sm
                        inset-0 flex items-center justify-center p-4
                        sm:inset-auto sm:bottom-4 sm:right-4 sm:flex-col sm:items-end sm:justify-end sm:p-0">
              {/* Chat popup container */}
              <div className="bg-panelLight dark:bg-panelDark overflow-hidden rounded-2xl border border-[#E7E7E7] shadow-lg dark:border-[#252525]
                          w-full max-w-[800px]
                          sm:max-w-[500px]">
                <div className="flex flex-col
                            h-[90vh] w-full
                            sm:h-[500px] sm:max-h-[80vh]">
                  <div className="relative flex items-center justify-between border-b border-[#E7E7E7] px-1 py-2 pb-1 dark:border-[#252525]">
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => setOpen(false)}
                            variant="ghost"
                            className="md:h-fit md:px-2"
                          >
                            <X className="dark:fill-iconDark fill-iconLight" />
                            <span className="sr-only">Close chat</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Close chat</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <div className="flex items-center gap-2">
                      {!isPro && (
                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild className="md:h-fit md:px-2">
                              <div>
                                <Gauge
                                  value={50 - chatMessages.remaining!}
                                  size="small"
                                  showValue={true}
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                You've used {50 - chatMessages.remaining!} out of 50 chat messages.
                              </p>
                              <p className="mb-2">Upgrade for unlimited messages!</p>
                              <Button onClick={handleUpgrade} className="h-8 w-full">
                                Upgrade
                              </Button>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      <TooltipProvider delayDuration={0}>
                        <Dialog>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DialogTrigger asChild>
                                <Button variant="ghost" className="md:h-fit md:px-2 [&>svg]:size-3">
                                  <Paper className="dark:fill-iconDark fill-iconLight h-3.5 w-3.5" />
                                </Button>
                              </DialogTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Prompts</TooltipContent>
                          </Tooltip>
                          <DialogContent showOverlay={true}>
                            <DialogHeader>
                              <DialogTitle>AI System Prompts</DialogTitle>
                              <DialogDescription>
                                We believe in Open Source, so we're open sourcing our AI system
                                prompts. Soon you will be able to customize them to your liking. For
                                now, here are the default prompts:
                              </DialogDescription>
                            </DialogHeader>
                            <div className="text-muted-foreground mb-1 mt-4 flex gap-2 text-sm">
                              <span>Zero Chat / System Prompt</span>
                              <Link
                                href={'https://github.com/Mail-0/Zero.git'}
                                target="_blank"
                                className="flex items-center gap-1 underline"
                              >
                                <span>Contribute</span>
                                <GitBranchPlus className="h-4 w-4" />
                              </Link>
                            </div>
                            <Textarea
                              className="min-h-60"
                              readOnly
                              value={AiChatPrompt('', '', '')}
                            />
                            <div className="text-muted-foreground mb-1 mt-4 flex gap-2 text-sm">
                              <span>Zero Compose / System Prompt</span>
                              <Link
                                href={'https://github.com/Mail-0/Zero.git'}
                                target="_blank"
                                className="flex items-center gap-1 underline"
                              >
                                <span>Contribute</span>
                                <GitBranchPlus className="h-4 w-4" />
                              </Link>
                            </div>
                            <Textarea
                              className="min-h-60"
                              readOnly
                              value={StyledEmailAssistantSystemPrompt().trim()}
                            />
                          </DialogContent>
                        </Dialog>
                      </TooltipProvider>

                      <TooltipProvider delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={handleNewChat}
                              variant="ghost"
                              className="md:h-fit md:px-2"
                            >
                              <Plus className="dark:text-iconDark text-iconLight" />
                              <span className="sr-only">New chat</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>New chat</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  <div className="relative flex-1 overflow-hidden">
                    <AIChat 
                      key={resetKey} 
                      {...chatState} 
                      // Pass the same chat state to ensure conversation continuity with desktop view
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </ResizablePanelGroup>
    </TooltipProvider>
  );
}

export default AISidebar;

// Add this style to the file to hide scrollbars
const noScrollbarStyle = `
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
`;

if (typeof document !== 'undefined') {
  // Add the style to the document head when on client
  const style = document.createElement('style');
  style.innerHTML = noScrollbarStyle;
  document.head.appendChild(style);
}
