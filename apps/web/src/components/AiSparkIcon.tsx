type AiSparkIconProps = {
  size?: number;
  className?: string;
};

export function AiSparkIcon({ size = 18, className }: AiSparkIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5 13.35 7.15 17 8.5l-3.65 1.35L12 13.5l-1.35-3.65L7 8.5l3.65-1.35L12 3.5Z" />
      <path d="m18.1 13.4.82 2.18 2.18.82-2.18.82-.82 2.18-.82-2.18-2.18-.82 2.18-.82.82-2.18Z" />
      <path d="m5.4 13.7.62 1.68 1.68.62-1.68.62-.62 1.68-.62-1.68-1.68-.62 1.68-.62.62-1.68Z" />
    </svg>
  );
}
