import { AppSidebar } from "@/components/ui/app-sidebar";
import AISidebar from "@/components/ui/ai-sidebar";

export default function MailLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppSidebar />
      <div className="w-full bg-white md:p-3 dark:bg-black">{children}</div>
      <AISidebar />
    </>
  );
}
