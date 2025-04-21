'use client';

import { AIChat } from '@/components/create/ai-chat';
import { Button } from '@/components/ui/button';
import { X, MessageSquare, PanelLeftOpen } from 'lucide-react';
import { useState, useEffect, useContext, createContext } from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useEditor } from '@/components/providers/editor-provider';
import { useHotkeys } from 'react-hotkeys-hook';
import { AI_SIDEBAR_COOKIE_NAME, SIDEBAR_COOKIE_MAX_AGE } from '@/lib/constants';
import { getCookie } from '@/lib/utils';

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
      <AISidebar>
        {children}
      </AISidebar>
    </AISidebarContext.Provider>
  );
}

export function AISidebar({ children, className }: AISidebarProps & { children: React.ReactNode }) {
  const { open, setOpen } = useAISidebar();
  const { editor } = useEditor();
  const [hasMessages, setHasMessages] = useState(false);

  useHotkeys('Meta+0', () => {
    setOpen(!open);
  });

  useHotkeys('Control+0', () => {
    setOpen(!open);
  });

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup direction="horizontal" className={cn(
        'bg-white dark:bg-black p-0',
      )}>
        <ResizablePanel>
          {children}
        </ResizablePanel>
        
        {open && (
          <>
            <ResizableHandle className='opacity-0 w-0.5' />
            <ResizablePanel defaultSize={25} minSize={20} maxSize={25}>
              <div className={cn(
                'h-[calc(98vh+15px)]',
                'flex flex-col',
                'mr-1 ml-0.5',
                className
              )}>
                <div className="flex h-full flex-col">
                  <div className="sticky top-0 z-10 flex items-center justify-end bg-white dark:bg-black">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="md:h-fit md:p-2 w-8" onClick={() => setOpen(false)}>
                          <PanelLeftOpen size={18} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Close</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="relative flex-1 overflow-hidden">
                    {!hasMessages && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="relative h-20 w-20">
                          <Image src="/black-icon.svg" alt="Zero Logo" fill className="dark:hidden" />
                          <Image src="/white-icon.svg" alt="Zero Logo" fill className="hidden dark:block" />
                        </div>
                        <p className="animate-shine mt-2 hidden bg-gradient-to-r from-neutral-500 via-neutral-300 to-neutral-500 bg-[length:200%_100%] bg-clip-text text-lg text-transparent opacity-50 md:block">
                          Ask Zero a question...
                        </p>
                      </div>
                    )}
                    <AIChat editor={editor} onMessagesChange={(messages) => setHasMessages(messages.length > 0)} />
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
