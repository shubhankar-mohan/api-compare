import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface AdBannerProps {
  adSlot: string;
  adClient?: string;
  format?: 'auto' | 'rectangle' | 'vertical' | 'horizontal';
  className?: string;
}

export function AdBanner({ 
  adSlot, 
  adClient = 'ca-pub-2646346403537887',
  format = 'auto',
  className 
}: AdBannerProps) {
  const adRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      // Push ad only if adsbygoogle is available
      if (typeof window !== 'undefined' && (window as any).adsbygoogle) {
        (window as any).adsbygoogle.push({});
      }
    } catch (err) {
      console.error('AdSense error:', err);
    }
  }, []);

  const sizeClasses = {
    auto: 'min-h-[100px]',
    rectangle: 'w-full aspect-square max-w-[300px]',
    vertical: 'w-full min-h-[200px] max-w-[300px]',
    horizontal: 'w-full h-[90px]',
  };

  return (
    <div 
      ref={adRef}
      className={cn(
        "bg-muted/30 border border-border/50 rounded-lg overflow-hidden flex items-center justify-center",
        sizeClasses[format],
        className
      )}
    >
      {/* Development placeholder - replace with actual AdSense code in production */}
      {process.env.NODE_ENV === 'development' ? (
        <div className="text-center text-muted-foreground p-2">
          <p className="text-xs font-medium">Ad Space</p>
          <p className="text-[10px] mt-1">{format === 'vertical' ? 'Vertical' : format === 'rectangle' ? 'Square' : format === 'horizontal' ? 'Banner' : 'Auto'}</p>
        </div>
      ) : (
        <ins
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', height: '100%' }}
          data-ad-client={adClient}
          data-ad-slot={adSlot}
          data-ad-format={format === 'auto' ? 'auto' : undefined}
          data-full-width-responsive={format === 'auto' ? 'true' : undefined}
        />
      )}
    </div>
  );
}
