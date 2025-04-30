'use client';

import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { AI_SIDEBAR_COOKIE_NAME, SIDEBAR_COOKIE_MAX_AGE } from '@/lib/constants';
import { useState, useEffect, useContext, createContext, useCallback } from 'react';
import { useEditor } from '@/components/providers/editor-provider';
import { MessageSquare, PanelLeftOpen, Plus } from 'lucide-react';
import { X } from '@/components/icons/icons';
import { AIChat } from '@/components/create/ai-chat';
import { Button } from '@/components/ui/button';
import { useHotkeys } from 'react-hotkeys-hook';
import { getCookie } from '@/lib/utils';
import { cn } from '@/lib/utils';
import Image from 'next/image';

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
  const { editor } = useEditor();
  const [hasMessages, setHasMessages] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  useHotkeys('Meta+0', () => {
    setOpen(!open);
  });

  useHotkeys('Control+0', () => {
    setOpen(!open);
  });

  const handleNewChat = useCallback(() => {
    setResetKey(prev => prev + 1);
    setHasMessages(false);
  }, []);

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        className={cn('bg-lightBackground dark:bg-darkBackground p-0')}
      >
        <ResizablePanel>{children}</ResizablePanel>

        {open && (
          <>
            <ResizablePanel
              defaultSize={25}
              minSize={20}
              maxSize={45}
              className="bg-panelLight dark:bg-panelDark ml- mr-1.5 mt-1 h-[calc(98vh+9px)] border-[#E7E7E7] shadow-sm md:rounded-2xl md:border md:shadow-sm dark:border-[#252525]"
            >
              <div className={cn('h-[calc(98vh+15px)]', 'flex flex-col', '', className)}>
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between relative  px-2.5 border-b border-[#E7E7E7] dark:border-[#252525] pt-[21px] pb-[10px]">
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
                        {/* <TooltipContent>{label}</TooltipContent> */}
                      </Tooltip>
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
                        {/* <TooltipContent>{label}</TooltipContent> */}
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="b relative flex-1 overflow-hidden">
                    {!hasMessages && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="relative mb-4 h-[44px] w-[44px]">
                          <Image
                            src="/black-icon.svg"
                            alt="Zero Logo"
                            fill
                            className="dark:hidden"
                          />
                          <Image
                            src="/white-icon.svg"
                            alt="Zero Logo"
                            fill
                            className="hidden dark:block"
                          />
                        </div>
                        <p className="mb-1 mt-2 hidden text-sm text-black md:block dark:text-white font-medium">
                          Ask anything about your emails
                        </p>
                        <p className="text-sm text-[#8C8C8C] dark:text-[#929292] mb-3">
                          Ask to do or show anything using natural language
                        </p>

                        <div className="mt-6 flex w-full flex-col items-center gap-2">
                          {/* First row */}
                          <div className="no-scrollbar relative flex w-full justify-center overflow-x-auto">
                            <div className="flex gap-4 px-4">
                              <p className="flex-shrink-0 whitespace-nowrap rounded-md bg-[#f0f0f0] p-1 px-2 text-sm text-[#555555] dark:bg-[#262626] dark:text-[#929292]">
                                Find invoice from Stripe
                              </p>
                              <p className="flex-shrink-0 whitespace-nowrap rounded-md bg-[#f0f0f0] p-1 px-2 text-sm text-[#555555] dark:bg-[#262626] dark:text-[#929292]">
                                Reply to Nick
                              </p>
                              <p className="flex-shrink-0 whitespace-nowrap rounded-md bg-[#f0f0f0] p-1 px-2 text-sm text-[#555555] dark:bg-[#262626] dark:text-[#929292]">
                                Show recent design feedback
                              </p>
                            </div>
                            {/* Left mask */}
                            <div className="pointer-events-none absolute bottom-0 left-0 top-0 w-12 bg-gradient-to-r from-panelLight to-transparent dark:from-panelDark"></div>
                            {/* Right mask */}
                            <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-12 bg-gradient-to-l from-panelLight to-transparent dark:from-panelDark"></div>
                          </div>

                          {/* Second row */}
                          <div className="no-scrollbar relative flex w-full justify-center overflow-x-auto">
                            <div className="flex gap-4 px-4">
                              <p className="flex-shrink-0 whitespace-nowrap rounded-md bg-[#f0f0f0] p-1 px-2 text-sm text-[#555555] dark:bg-[#262626] dark:text-[#929292]">
                                Schedule meeting with Sarah
                              </p>
                              <p className="flex-shrink-0 whitespace-nowrap rounded-md bg-[#f0f0f0] p-1 px-2 text-sm text-[#555555] dark:bg-[#262626] dark:text-[#929292]">
                                What did alex say about the design
                              </p>
                            </div>
                            {/* Left mask */}
                            <div className="pointer-events-none absolute bottom-0 left-0 top-0 w-12 bg-gradient-to-r from-panelLight to-transparent dark:from-panelDark"></div>
                            {/* Right mask */}
                            <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-12 bg-gradient-to-l from-panelLight to-transparent dark:from-panelDark"></div>
                          </div>
                        </div>
                      </div>
                    )}
                    <AIChat
                      editor={editor}
                      onMessagesChange={(messages) => setHasMessages(messages.length > 0)}
                      key={resetKey}
                    />
                  </div>
                </div>
              </div>
            </ResizablePanel>
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
