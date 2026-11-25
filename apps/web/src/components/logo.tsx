/** The CountMetrics logo. The name is always written next to it, so screen readers skip the image. */
export function Logo({ size, className }: { size: number; className?: string }) {
  return <img src="/logo.svg" alt="" width={size} height={size} className={className} />;
}
