import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";
import { cn } from "@/lib/utils";

interface CookieTriggerProps {
  variant?: "link" | "button" | "prominent" | "icon";
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
}

export function CookieTrigger({
  variant = "button",
  className,
  children,
  onClick,
}: CookieTriggerProps) {
  const variants = {
    link: "text-primary underline-offset-4 hover:underline p-0 h-auto",
    button: "bg-primary text-primary-foreground hover:bg-primary/90",
    prominent: "bg-blue-600 text-white hover:bg-blue-700 font-medium px-6",
    icon: "h-12 w-12 rounded-full border-zinc-800 bg-blue-600 text-white shadow-lg hover:bg-blue-700",
  };

  return (
    <Button
      variant={variant === "link" ? "link" : "default"}
      className={cn(variants[variant], className)}
      onClick={onClick}
    >
      {children || (
        <>
          {variant === "icon" ? (
            <Cookie className="h-6 w-6" />
          ) : (
            <>
              <Cookie className="mr-2 h-4 w-4" />
              Cookie Settings
            </>
          )}
        </>
      )}
    </Button>
  );
}
