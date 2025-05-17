'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import {
  useState,
  useEffect,
  useContext,
  createContext,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useQueryState } from 'nuqs';
import { AI_SIDEBAR_COOKIE_NAME, SIDEBAR_COOKIE_MAX_AGE } from '@/lib/constants';
import { StyledEmailAssistantSystemPrompt, AiChatPrompt } from '@/lib/prompts';
import { usePathname, useSearchParams, useParams } from 'next/navigation';
import { useSearchValue } from '@/hooks/use-search-value';
import { useQueryClient } from '@tanstack/react-query';
import { AIChat } from '@/components/create/ai-chat';
import { useTRPC } from '@/providers/query-provider';
import { X, FileText, Expand, Plus, GitBranchPlus, Maximize2 as LucideMaximize2, Minimize2 as LucideMinimize2 } from 'lucide-react';
import { Tools } from '../../../server/src/types';
import { useBilling } from '@/hooks/use-billing';
import { Button } from '@/components/ui/button';
import { useHotkeys } from 'react-hotkeys-hook';
import { useLabels } from '@/hooks/use-labels';
import { Gauge } from '@/components/ui/gauge';
import { useCustomer } from 'autumn-js/next';
import { useChat } from '@ai-sdk/react';
import { getCookie } from '@/lib/utils';
import { Textarea } from './textarea';
import { cn } from '@/lib/utils';
import { env } from '@/lib/env';
import Image from 'next/image';
import { toast } from 'sonner';
import Link from 'next/link';
import { PricingDialog } from './pricing-dialog';
import { Paper } from '../icons/icons';

interface AISidebarProps {
  className?: string;
}

type ViewMode = 'sidebar' | 'popup' | 'fullscreen';

export function useAIFullScreen() {
  const [isFullScreenQuery, setIsFullScreen] = useQueryState('isFullScreen');
  const toggleFullScreen = useCallback(
    async (value: boolean) => {
      await setIsFullScreen(value ? 'true' : null);
    },
    [setIsFullScreen]
  );
  return { 
    isFullScreen: isFullScreenQuery ? isFullScreenQuery === 'true' : false, 
    setIsFullScreen: toggleFullScreen
  };
}

export function useAISidebar() {
  const [open, setOpen] = useQueryState('aiSidebar');
  const [viewMode, setViewMode] = useState<ViewMode>('sidebar');
  const { isFullScreen, setIsFullScreen } = useAIFullScreen();

  return {
    open: !!open,
    viewMode,
    setViewMode,
    setOpen: (open: boolean) => setOpen(open ? 'true' : null),
    toggleOpen: () => setOpen((prev) => (prev === 'true' ? null : 'true')),
    toggleViewMode: () => setViewMode((prev: ViewMode) => prev === 'sidebar' ? 'popup' : 'sidebar'),
    isFullScreen,
    setIsFullScreen
  };
}

function AISidebar({ className }: AISidebarProps) {
  const { open, setOpen, viewMode, isFullScreen, setIsFullScreen, toggleViewMode } = useAISidebar();
  const [resetKey, setResetKey] = useState(0);
  const [showPricing, setShowPricing] = useState(false);
  const pathname = usePathname();
  const { attach, customer, chatMessages, track, refetch: refetchBilling } = useBilling();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const [threadId] = useQueryState('threadId');
  const { folder } = useParams<{ folder: string }>();
  const { refetch: refetchLabels } = useLabels();
  const [searchValue] = useSearchValue();

  // Initialize shared chat state that will be used by both desktop and mobile views
  // This ensures conversation continuity when switching between viewport sizes
  const chatState = useChat({
    api: `${env.NEXT_PUBLIC_BACKEND_URL}/api/chat`,
    fetch: (url, options) => fetch(url, { ...options, credentials: 'include' }),
    maxSteps: 5,
    body: {
      threadId: threadId ?? undefined,
      currentFolder: folder ?? undefined,
      currentFilter: searchValue.value ?? undefined,
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
    onFinish: () => {},
    async onToolCall({ toolCall }) {
      console.warn('toolCall', toolCall);
      switch (toolCall.toolName) {
        case Tools.CreateLabel:
        case Tools.DeleteLabel:
          await refetchLabels();
          break;
        case Tools.SendEmail:
          await queryClient.invalidateQueries({
            queryKey: trpc.mail.listThreads.queryKey({ folder: 'sent' }),
          });
          break;
        case Tools.MarkThreadsRead:
        case Tools.MarkThreadsUnread:
        case Tools.ModifyLabels:
        case Tools.BulkDelete:
          console.log('modifyLabels', toolCall.args);
          await refetchLabels();
          await Promise.all(
            (toolCall.args as { threadIds: string[] }).threadIds.map((id) =>
              queryClient.invalidateQueries({
                queryKey: trpc.mail.get.queryKey({ id }),
              }),
            ),
          );
          break;
      }
      await track({ featureId: 'chat-messages', value: 1 });
      await refetchBilling();
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

  const handleUpgrade = () => {
    setShowPricing(true);
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

  return (
    <>
      <PricingDialog open={showPricing} onOpenChange={setShowPricing} />
      {open && (
        <>
          {/* Desktop view - visible on md and larger screens */}
        {viewMode === 'sidebar' && !isFullScreen ? (
          <>
            <ResizableHandle className="opacity-0" />
            <ResizablePanel
              defaultSize={20}
              minSize={20}
              maxSize={35}
              className="bg-panelLight dark:bg-panelDark mr-1 hidden h-[calc(98vh+17px)] border-[#E7E7E7] shadow-sm md:rounded-2xl md:border md:shadow-sm md:block dark:border-[#252525]"
            >
          <div className={cn('h-[calc(98vh+6px)]', 'flex flex-col', '', className)}>
            <div className="flex h-full flex-col">
              <div className="relative flex items-center justify-between border-b border-[#E7E7E7] px-2.5 pb-[10px] pt-[13px] dark:border-[#252525]">
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
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={toggleViewMode}
                          variant="ghost"
                          className="hidden md:flex md:h-fit md:px-2 [&>svg]:size-2"
                        >
                          <Expand className="dark:fill-iconDark fill-iconLight" />
                          <span className="sr-only">Toggle view mode</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Go to popup view</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => setIsFullScreen(!isFullScreen)}
                          variant="ghost"
                          className="md:h-fit md:px-2"
                        >
                          {isFullScreen ? (
                            <LucideMinimize2 className="dark:fill-iconDark fill-iconLight" />
                          ) : (
                            <LucideMaximize2 className="dark:fill-iconDark fill-iconLight" />
                          )}
                          <span className="sr-only">Toggle fullscreen</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Toggle fullscreen</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

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
                          <p>You've used {50 - chatMessages.remaining!} out of 50 chat messages.</p>
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
                            We believe in Open Source, so we're open sourcing our AI system prompts.
                            Soon you will be able to customize them to your liking. For now, here
                            are the default prompts:
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
                        <Textarea className="min-h-60" readOnly value={AiChatPrompt('', '', '')} />
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
        </>
        ) : null}

        {/* Popup view - visible on small screens or when popup mode is selected */}
        <div className={cn(
          "fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm sm:inset-auto sm:bottom-4 sm:right-4 sm:flex-col sm:items-end sm:justify-end sm:p-0 transition-opacity bg-transparent duration-150 opacity-40 hover:opacity-100",
          "md:hidden", // Hide on md+ screens by default
          viewMode === 'popup' && !isFullScreen && "md:flex", // Show on md+ screens when in popup mode
          isFullScreen && "!flex !inset-0 !opacity-100 !p-0 !backdrop-blur-none" // Full screen mode
        )}>
          {/* Chat popup container - only visible on small screens or when popup mode is selected */}
          <div className={cn(
            "bg-panelLight dark:bg-panelDark w-full overflow-hidden rounded-2xl border border-[#E7E7E7] shadow-lg dark:border-[#252525]",
            "md:hidden", // Hide on md+ screens by default
            viewMode === 'popup' && !isFullScreen && "md:block max-w-[900px] sm:max-w-[600px]", // Show on md+ screens when in popup mode
            isFullScreen && "!block !max-w-none !rounded-none !border-none" // Full screen mode
          )}>
            <div className={cn("flex w-full flex-col",
              isFullScreen ? "h-screen" : "h-[90vh] sm:h-[600px] sm:max-h-[85vh]"
            )}>
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
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={toggleViewMode}
                          variant="ghost"
                          className="hidden md:flex md:h-fit md:px-2"
                        >
                          <Expand className="dark:fill-iconDark fill-iconLight" />

                          <span className="sr-only">Toggle view mode</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Toggle between sidebar and popup</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => setIsFullScreen(!isFullScreen)}
                          variant="ghost"
                          className="md:h-fit md:px-2"
                        >
                          {isFullScreen ? (
                            <LucideMinimize2 className="dark:fill-iconDark fill-iconLight" />
                          ) : (
                            <LucideMaximize2 className="dark:fill-iconDark fill-iconLight" />
                          )}
                          <span className="sr-only">Toggle fullscreen</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Toggle fullscreen</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

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
                          <p>You've used {50 - chatMessages.remaining!} out of 50 chat messages.</p>
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
                            We believe in Open Source, so we're open sourcing our AI system prompts.
                            Soon you will be able to customize them to your liking. For now, here
                            are the default prompts:
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
                        <Textarea className="min-h-60" readOnly value={AiChatPrompt('', '', '')} />
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
                
                />
              </div>
            </div>
          </div>
        </div>
        </>
      )}
    </>
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
