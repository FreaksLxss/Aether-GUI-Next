export function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex flex-col gap-3">
        <div className="h-6 w-28 animate-pulse rounded-full bg-white/[0.06] light:bg-black/[0.04]" />
        <div className="flex flex-col gap-2 rounded-[49px] bg-card p-3.5">
          <div className="h-10 animate-pulse rounded-[35px] bg-white/[0.04] light:bg-black/[0.03]" />
          <div className="h-10 animate-pulse rounded-[35px] bg-white/[0.04] light:bg-black/[0.03]" />
          <div className="h-20 animate-pulse rounded-[35px] bg-white/[0.04] light:bg-black/[0.03]" />
        </div>
      </div>
      <div className="h-24 animate-pulse rounded-[49px] bg-card light:border light:border-black/[0.06]" />
    </div>
  );
}
