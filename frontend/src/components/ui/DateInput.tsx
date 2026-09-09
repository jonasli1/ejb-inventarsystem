import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  error?: string;
}

/**
 * A date input that shows "Datum auswählen" instead of the browser's native
 * mm/dd/yyyy placeholder while empty - native `type="date"` inputs ignore
 * the `placeholder` attribute entirely, so this hides the native (empty)
 * text via CSS and overlays custom text instead. Works both as an
 * uncontrolled field (react-hook-form's `register()`, no `value` prop) and
 * as a controlled one (`value`/`onChange`): emptiness is read straight off
 * the DOM node after every render - via a dependency-less effect - rather
 * than tracked only through change events, so a value applied
 * programmatically (e.g. react-hook-form's `reset()`, which sets the DOM
 * value without firing a native input event) is still picked up correctly.
 * Hides the overlay while focused so the native day/month/year segments
 * stay visible/usable during manual entry.
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, error, onFocus, onBlur, onInput, ...props }, forwardedRef) => {
    const innerRef = useRef<HTMLInputElement | null>(null);
    const [isEmpty, setIsEmpty] = useState(true);
    const [isFocused, setIsFocused] = useState(false);

    const syncEmpty = () => setIsEmpty(!innerRef.current?.value);

    // Runs after every render (deliberately no dependency array) so a value
    // set imperatively (e.g. react-hook-form's reset()) - which never fires
    // a native input event - is still reflected here.
    useEffect(() => {
      syncEmpty();
    });

    const showPlaceholder = isEmpty && !isFocused;

    return (
      <div className="relative">
        <input
          type="date"
          ref={(node) => {
            innerRef.current = node;
            if (typeof forwardedRef === 'function') forwardedRef(node);
            else if (forwardedRef) forwardedRef.current = node;
          }}
          onInput={(e) => {
            syncEmpty();
            onInput?.(e);
          }}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          className={clsx(
            'h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink outline-none transition-shadow',
            'focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
            error && 'border-red-400 focus:border-red-500 focus:ring-red-100',
            showPlaceholder && 'text-transparent',
            className,
          )}
          {...props}
        />
        {showPlaceholder && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
            Datum auswählen
          </span>
        )}
      </div>
    );
  },
);
DateInput.displayName = 'DateInput';
