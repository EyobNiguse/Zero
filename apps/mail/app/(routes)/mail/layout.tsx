import { HotkeyProviderWrapper } from '@/components/providers/hotkey-provider-wrapper';
import { OnboardingWrapper } from '@/components/onboarding';
import { AppSidebar } from '@/components/ui/app-sidebar';
import { LocalMode } from '@/app/local/rpc/local-mode';
import { Outlet } from 'react-router';

export default function MailLayout() {
  return (
    <HotkeyProviderWrapper>
      <AppSidebar />
      <div className="bg-sidebar dark:bg-sidebar w-full">
        <Outlet />
      </div>
      <OnboardingWrapper />
      <LocalMode />
    </HotkeyProviderWrapper>
  );
}
