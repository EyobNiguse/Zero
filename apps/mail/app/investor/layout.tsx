'use client';

export default function InvestorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full overflow-hidden" style={{ height: '100vh', width: '100vw' }}>
      {children}
    </div>
  );
} 