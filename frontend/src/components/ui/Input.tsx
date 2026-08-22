import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'h-9 w-full rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none transition-shadow',
        'placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
        error && 'border-red-400 focus:border-red-500 focus:ring-red-100',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      {...props}
      className={clsx('mb-1.5 block text-sm font-medium text-ink', props.className)}
    />
  );
}

export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-red-600">{children}</p>;
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      <FieldError>{error}</FieldError>
    </div>
  );
}
