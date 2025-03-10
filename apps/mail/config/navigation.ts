import { SettingsGearIcon } from "@/components/icons/animated/settings-gear";
import { CheckCheckIcon } from "@/components/icons/animated/check-check";
import { ArrowLeftIcon } from "@/components/icons/animated/arrow-left";
import { BookTextIcon } from "@/components/icons/animated/book-text";
import { ShieldCheckIcon } from "@/components/icons/animated/shield";
import { KeyboardIcon } from "@/components/icons/animated/keyboard";
import { SparklesIcon } from "@/components/icons/animated/sparkles";
import { ArchiveIcon } from "@/components/icons/animated/archive";
import { DeleteIcon } from "@/components/icons/animated/trash";
import { UsersIcon } from "@/components/icons/animated/users";
import { InboxIcon } from "@/components/icons/animated/inbox";
import { XIcon } from "@/components/icons/animated/x";
import { NestedKeyOf } from "next-intl";
import { MessageKeys } from "next-intl";
export interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<any>;
  badge?: number;
  isBackButton?: boolean;
  isSettingsButton?: boolean;
  disabled?: boolean;
}
export type MessageKey = MessageKeys<IntlMessages, NestedKeyOf<IntlMessages>>;

interface NavSection {
  title: string;
  items: NavItem[];
}

interface NavConfig {
  path: string;
  sections: NavSection[];
}

// ! items title has to be a message key (check messages/en.json)
export const navigationConfig: Record<string, NavConfig> = {
  mail: {
    path: "/mail",
    sections: [
      {
        title: "",
        items: [
          {
            title: "Sidebar.Inbox",
            url: "/mail/inbox",
            icon: InboxIcon,
          },
          {
            title: "Sidebar.Drafts",
            url: "/mail/draft",
            icon: BookTextIcon,
          },
          {
            title: "Sidebar.Sent",
            url: "/mail/sent",
            icon: CheckCheckIcon,
          },
          {
            title: "Sidebar.Spam",
            url: "/mail/spam",
            icon: XIcon,
          },
          {
            title: "Sidebar.Archive",
            url: "/mail/archive",
            icon: ArchiveIcon,
            disabled: true,
          },
          {
            title: "Sidebar.Bin",
            url: "/mail/bin",
            icon: DeleteIcon,
            disabled: true,
          },
          {
            title: "Sidebar.Settings",
            url: "/settings/general",
            icon: SettingsGearIcon,
            isSettingsButton: true,
          },
        ],
      },
      // {
      //   title: "Categories",
      //   items: [
      //     {
      //       title: "Social",
      //       url: "/mail/inbox?category=social",
      //       icon: UsersIcon,
      //       badge: 972,
      //     },
      //     {
      //       title: "Updates",
      //       url: "/mail/inbox?category=updates",
      //       icon: BellIcon,
      //       badge: 342,
      //     },
      //     {
      //       title: "Forums",
      //       url: "/mail/inbox?category=forums",
      //       icon: MessageCircleIcon,
      //       badge: 128,
      //     },
      //     {
      //       title: "Shopping",
      //       url: "/mail/inbox?category=shopping",
      //       icon: CartIcon,
      //       badge: 8,
      //     },
      //   ],
      // },
      // {
      //   title: "Advanced",
      //   items: [
      //     {
      //       title: "Settings",
      //       url: "/settings",
      //       icon: SettingsGearIcon,
      //     },
      //   ],
      // },
    ],
  },
  settings: {
    path: "/settings",
    sections: [
      {
        title: "Settings",
        items: [
          {
            title: "Settings.Back",
            url: "/mail",
            icon: ArrowLeftIcon,
            isBackButton: true,
          },

          {
            title: "Settings.General",
            url: "/settings/general",
            icon: SettingsGearIcon,
          },
          {
            title: "Settings.Connections",
            url: "/settings/connections",
            icon: UsersIcon,
          },
          {
            title: "Settings.Security",
            url: "/settings/security",
            icon: ShieldCheckIcon,
          },
          {
            title: "Settings.Appearance",
            url: "/settings/appearance",
            icon: SparklesIcon,
          },
          {
            title: "Settings.Shortcuts",
            url: "/settings/shortcuts",
            icon: KeyboardIcon,
          },
          // {
          //   title: "Notifications",
          //   url: "/settings/notifications",
          //   icon: BellIcon,
          // },
        ].map((item) => ({
          ...item,
          isSettingsPage: true,
        })),
      },
    ],
  },
};
