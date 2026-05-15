import type { ReactNode } from "react";

type ToolIconButtonProps = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
};

export function ToolIconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: ToolIconButtonProps) {
  return (
    <button
      className={`inline-flex h-8 w-8 items-center justify-center rounded-[var(--ui-radius-sm)] border-none bg-transparent text-[var(--icon-color)] transition-colors hover:bg-[var(--ui-hover-bg)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-[var(--ui-accent-bg)] !text-[var(--acrobat-blue)]" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      type="button"
    >
      {children}
    </button>
  );
}
