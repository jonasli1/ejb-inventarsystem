import {
  escapeHtml,
  htmlToPlainText,
  renderTemplate,
  wrapEmailHtml,
} from './email-template.util';

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'quote'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quote&#39;',
    );
  });
});

describe('renderTemplate', () => {
  it('substitutes known variables, HTML-escaping the value', () => {
    const result = renderTemplate('Hallo {{name}}!', { name: '<b>Jane</b>' });
    expect(result).toBe('Hallo &lt;b&gt;Jane&lt;/b&gt;!');
  });

  it('leaves unknown tokens as empty string', () => {
    expect(renderTemplate('Hallo {{missing}}!', {})).toBe('Hallo !');
  });

  it('does not touch the surrounding markup, only the interpolated values', () => {
    const result = renderTemplate('<p>Hallo {{name}}</p>', { name: 'Jane' });
    expect(result).toBe('<p>Hallo Jane</p>');
  });
});

describe('htmlToPlainText', () => {
  it('converts paragraphs and line breaks to blank lines/newlines', () => {
    const result = htmlToPlainText('<p>Erste Zeile</p><p>Zweite<br>Zeile</p>');
    expect(result).toBe('Erste Zeile\n\nZweite\nZeile');
  });

  it('preserves the href of a link instead of discarding it with the tag', () => {
    const result = htmlToPlainText(
      '<p><a href="https://example.com/reset?token=abc">Passwort zurücksetzen</a></p>',
    );
    expect(result).toContain('https://example.com/reset?token=abc');
    expect(result).toContain('Passwort zurücksetzen');
  });

  it('decodes common HTML entities', () => {
    expect(htmlToPlainText('A &amp; B &lt;C&gt;')).toBe('A & B <C>');
  });
});

describe('wrapEmailHtml', () => {
  it('includes the app name and body content', () => {
    const html = wrapEmailHtml({
      appName: 'Mein Inventar',
      logoDataUrl: null,
      bodyHtml: '<p>Hallo Welt</p>',
    });
    expect(html).toContain('Mein Inventar');
    expect(html).toContain('<p>Hallo Welt</p>');
  });

  it('renders an <img> instead of the text fallback when a logo is set', () => {
    const html = wrapEmailHtml({
      appName: 'Mein Inventar',
      logoDataUrl: 'data:image/png;base64,AAAA',
      bodyHtml: '<p>x</p>',
    });
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
  });
});
