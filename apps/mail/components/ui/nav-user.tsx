'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { HelpCircle, LogIn, LogOut, MoonIcon, Settings, Plus } from 'lucide-react';
import { CircleCheck } from '../icons/icons';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useConnections } from '@/hooks/use-connections';
import { signOut, useSession } from '@/lib/auth-client';
import { AddConnectionDialog } from '../connection/add';
import { putConnection } from '@/actions/connections';
import { useSidebar } from '@/components/ui/sidebar';
import { dexieStorageProvider } from '@/lib/idb';
import { SunIcon } from '../icons/animated/sun';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type IConnection } from '@/types';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import Link from 'next/link';

export function NavUser() {
  const { data: session, refetch } = useSession();
  const router = useRouter();
  const { data: connections, isLoading, mutate } = useConnections();
  const [isRendered, setIsRendered] = useState(false);
  const { theme, resolvedTheme, setTheme } = useTheme();
  const t = useTranslations();
  const { state } = useSidebar();

  const pathname = usePathname();
  const searchParams = useSearchParams();

  const getSettingsHref = useCallback(() => {
    const category = searchParams.get('category');
    const currentPath = category
      ? `${pathname}?category=${encodeURIComponent(category)}`
      : pathname;
    return `/settings/general?from=${encodeURIComponent(currentPath)}`;
  }, [pathname, searchParams]);

  const handleClearCache = useCallback(async () => {
    dexieStorageProvider().clear();
    toast.success('Cache cleared successfully');
  }, []);

  const activeAccount = useMemo(() => {
    if (!session) return null;
    return connections?.find((connection) => connection.id === session?.connectionId);
  }, [session, connections]);

  useEffect(() => setIsRendered(true), []);

  const handleAccountSwitch = (connection: IConnection) => async () => {
    await putConnection(connection.id);
    refetch();
    mutate();
  };

  const handleLogout = async () => {
    toast.promise(
      signOut().then(() => router.push('/login')),
      {
        loading: 'Signing out...',
        success: () => 'Signed out successfully!',
        error: 'Error signing out',
      },
    );
  };

  if (!isRendered) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {state === 'collapsed' ? (
          activeAccount && (
            <div
              onClick={handleAccountSwitch(activeAccount)}
              className="flex cursor-pointer items-center"
            >
              <div className="relative">
                <Avatar className="size-8 rounded-[5px]">
                  <AvatarImage
                    className="rounded-[5px]"
                    src={activeAccount?.picture || undefined}
                    alt={activeAccount?.name || activeAccount?.email}
                  />
                  <AvatarFallback className="rounded-[5px] text-[10px]">
                    {(activeAccount?.name || activeAccount?.email)
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          )
        ) : (
          <>
            {connections?.map((connection) => (
              <div
                key={connection.id}
                onClick={handleAccountSwitch(connection)}
                className={`flex cursor-pointer items-center ${
                  connection.id === session?.connectionId && connections.length > 1
                    ? 'rounded-[5px] outline outline-2 outline-mainBlue'
                    : ''
                }`}
              >
                <div className="relative">
                  <Avatar className="size-7 rounded-[5px]">
                    <AvatarImage
                      className="rounded-[5px]"
                      src={connection.picture || undefined}
                      alt={connection.name || connection.email}
                    />
                    <AvatarFallback className="rounded-[5px] text-[10px]">
                      {(connection.name || connection.email)
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  {connection.id === session?.connectionId && connections.length > 1 && (
                    <CircleCheck className="absolute -bottom-2 -right-2 size-4 rounded-full bg-white dark:bg-black fill-mainBlue" />
                  )}
                </div>
              </div>
            ))}
            <AddConnectionDialog>
              <button className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[5px] dark:bg-[#262626] dark:text-[#929292] border border-dashed">
                <Plus className="size-4" />
              </button>
            </AddConnectionDialog>
          </>
        )}
      </div>
      {state !== 'collapsed' && (
        <div className="flex flex-col items-start gap-1 my-2 space-y-1">
          <div className="text-[13px] leading-none text-black dark:text-white">
            {activeAccount?.name || session?.user.name || 'User'}
          </div>
          <div className="text-xs font-normal leading-none text-[#898989]">
            {activeAccount?.email || session?.user.email}
          </div>
        </div>
      )}
    </div>
  );
}
