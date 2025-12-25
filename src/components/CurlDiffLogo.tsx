export function CurlDiffLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 40 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background circle */}
      <circle cx="20" cy="20" r="18" className="fill-primary/10" />
      
      {/* Left bracket - removal/original */}
      <path 
        d="M12 12L8 20L12 28" 
        className="stroke-[hsl(var(--diff-removed))]"
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        fill="none"
      />
      
      {/* Right bracket - addition/localhost */}
      <path 
        d="M28 12L32 20L28 28" 
        className="stroke-[hsl(var(--diff-added))]"
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        fill="none"
      />
      
      {/* Center arrows showing comparison */}
      <path 
        d="M16 17L20 20L16 23" 
        className="stroke-primary"
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        fill="none"
      />
      <path 
        d="M24 17L20 20L24 23" 
        className="stroke-primary"
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
