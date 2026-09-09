import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Bold, Underline as UnderlineIcon, X } from 'lucide-react';
import { clsx } from 'clsx';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

/** Adds a `fontSize` attribute to the textStyle mark (TipTap has no built-in font-size control). */
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontSize || null,
            renderHTML: (attributes: { fontSize?: string | null }) =>
              attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).run(),
    };
  },
});

const FONT_SIZES = [
  { label: 'Normal', value: '' },
  { label: 'Klein', value: '12px' },
  { label: 'Groß', value: '20px' },
  { label: 'Sehr groß', value: '28px' },
];

function ToolbarButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'flex h-7 w-7 items-center justify-center rounded-md',
        active ? 'bg-brand-100 text-brand-700' : 'text-muted hover:bg-black/5 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

export interface RichTextEditorHandle {
  /** Inserts text (e.g. a {{placeholder}}) at the current cursor position. */
  insertText: (text: string) => void;
}

/**
 * Minimal WYSIWYG editor (TipTap) for admin-authored HTML content - used for
 * notification template bodies and the shared email footer. Toolbar is
 * intentionally limited to Fett/Unterstrichen/Farbe/Schriftgröße; the
 * underlying document model otherwise stays TipTap's default (paragraphs,
 * lists, etc. still work via keyboard, just without dedicated buttons).
 */
export const RichTextEditor = forwardRef<
  RichTextEditorHandle,
  { value: string; onChange: (html: string) => void }
>(function RichTextEditor({ value, onChange }, ref) {
  const editor = useEditor({
    extensions: [StarterKit, Underline, TextStyle, Color, FontSize],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          'min-h-[160px] px-3 py-2.5 text-sm text-ink outline-none [&_p]:mb-2 [&_p:last-child]:mb-0',
      },
    },
  });

  // Keep the editor synced when `value` changes from outside (switching
  // templates, resetting to default) without fighting the user's own typing.
  useEffect(() => {
    if (!editor || value === editor.getHTML()) return;
    editor.commands.setContent(value, { emitUpdate: false } as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  useImperativeHandle(
    ref,
    () => ({
      insertText: (text: string) => {
        editor?.chain().focus().insertContent(text).run();
      },
    }),
    [editor],
  );

  if (!editor) return null;

  const currentFontSize = (editor.getAttributes('textStyle').fontSize as string | undefined) ?? '';

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-1.5">
        <ToolbarButton
          label="Fett"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="Unterstrichen"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={15} />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-border" />

        <input
          type="color"
          title="Textfarbe"
          aria-label="Textfarbe"
          value={(editor.getAttributes('textStyle').color as string | undefined) ?? '#000000'}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0.5"
        />
        <ToolbarButton label="Farbe zurücksetzen" onClick={() => editor.chain().focus().unsetColor().run()}>
          <X size={13} />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-border" />

        <select
          value={currentFontSize}
          onChange={(e) => {
            const size = e.target.value;
            if (size) editor.chain().focus().setFontSize(size).run();
            else editor.chain().focus().unsetFontSize().run();
          }}
          className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs text-ink outline-none"
          aria-label="Schriftgröße"
        >
          {FONT_SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
});
