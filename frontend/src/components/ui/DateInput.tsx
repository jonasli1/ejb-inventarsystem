import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { X } from 'lucide-react';

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
 * stay visible/usable during manual entry. Once a value is set (and the
 * field isn't disabled), a "×" button clears it back to empty - native
 * clear affordances are inconsistent across browsers (Safari has none), and
 * an already-set optional date otherwise has no reliable way to be unset
 * again through this input alone.
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, error, disabled, onFocus, onBlur, onInput, ...props }, forwardedRef) => {
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
    const showClear = !isEmpty && !disabled;

    const handleClear = () => {
      const input = innerRef.current;
      if (!input) return;
      // React installs its own tracking setter on `value` to detect genuine
      // changes; a plain `input.value = ''` goes through that same setter,
      // so React's tracker silently updates too and then sees "no change"
      // when the event below fires - meaning react-hook-form's onChange
      // would never run and the clear wouldn't reach form state. Writing
      // through the native prototype setter instead bypasses React's
      // tracker, so the subsequent event is correctly seen as a real change.
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      syncEmpty();
    };

    return (
      <div className="relative">
        <input
          type="date"
          disabled={disabled}
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
            showClear && 'pr-8',
            className,
          )}
          {...props}
        />
        {showPlaceholder && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
            Datum auswählen
          </span>
        )}
        {showClear && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Datum löschen"
            className="absolute inset-y-0 right-1.5 flex items-center text-muted hover:text-ink"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  },
);
DateInput.displayName = 'DateInput';
