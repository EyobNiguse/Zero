'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DraftsList } from '@/components/draft/drafts-list';
import { useSearchValue } from '@/hooks/use-search-value';
import { SearchIcon } from '../icons/animated/search';
import { useMail } from '@/components/mail/use-mail';
import { SidebarToggle } from '../ui/sidebar-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import { ArchiveX, BellOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn, defaultPageSize } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useHotKey } from '@/hooks/use-hot-key';
import { SearchBar } from '../mail/search-bar';
import { useDrafts } from '@/hooks/use-drafts';
import { useSession } from '@/lib/auth-client';
import { XIcon } from '../icons/animated/x';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';

export function DraftsLayout() {
	// const [searchMode, setSearchMode] = useState(false);
	// const [searchValue] = useSearchValue();
	// const [mail, setMail] = useMail();
	// const router = useRouter();
	// const { data: session, isPending } = useSession();
	// const t = useTranslations();
	//
	// // useEffect(() => {
	// // 	if (!session?.user && !isPending) {
	// // 		router.push('/login');
	// // 	}
	// // }, [session?.user, isPending]);
	//
	// const { isLoading, isValidating } = useDrafts(searchValue.value, defaultPageSize);
	//
	// useHotKey('/', () => {
	// 	setSearchMode(true);
	// });
	//
	// useHotKey('Esc', (event) => {
	// 	// @ts-expect-error
	// 	event.preventDefault();
	// 	if (searchMode) {
	// 		setSearchMode(false);
	// 	}
	// });
	//
	// const searchIconRef = useRef<any>(null);

	return <p>Test</p>;
}

function BulkSelectActions() {
	const t = useTranslations();

	return (
		<div className="flex items-center gap-1.5">
			<Tooltip>
				<TooltipTrigger asChild>
					<Button variant="ghost" className="md:h-fit md:px-2">
						<BellOff />
					</Button>
				</TooltipTrigger>
				<TooltipContent>{t('common.mail.mute')}</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button variant="ghost" className="md:h-fit md:px-2">
						<ArchiveX />
					</Button>
				</TooltipTrigger>
				<TooltipContent>{t('common.mail.moveToSpam')}</TooltipContent>
			</Tooltip>
		</div>
	);
}
