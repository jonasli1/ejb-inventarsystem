/** Escapes a value being interpolated into HTML - the template markup itself is trusted (admin-authored), only substituted values are escaped. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Replaces every `{{variableName}}` token with its (HTML-escaped) value; unknown tokens become empty. */
export function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) =>
    key in variables ? escapeHtml(variables[key]) : '',
  );
}

/** Rough HTML -> plain-text fallback for the multipart email's text/plain part. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*/gi, '\n\n')
    .replace(/<\/(div|tr|h[1-6])>\s*/gi, '\n')
    // Preserve link targets - a plain-text client would otherwise lose the
    // URL entirely once the tag is stripped (this is the actual link in
    // e.g. a password-reset email, not just decoration).
    .replace(
      /<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis,
      (_match, href: string, text: string) =>
        text.trim() && text.trim() !== href ? `${text.trim()}: ${href}` : href,
    )
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Wraps a rendered body (already-safe HTML, e.g. from renderTemplate) in a
 * simple, responsive, table-based email shell with the app's logo/name in
 * the header - table layout + inline styles for maximum email client
 * compatibility (no external stylesheet, no modern CSS).
 */
export function wrapEmailHtml(opts: {
  appName: string;
  logoDataUrl: string | null;
  bodyHtml: string;
  /** Admin-authored HTML (trusted, like bodyHtml - not escaped); falls back to a generic default text when unset. */
  footerHtml?: string | null;
}): string {
  const { appName, logoDataUrl, bodyHtml } = opts;
  const logo = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="${escapeHtml(appName)}" height="40" style="height:40px;width:auto;display:block;border:0;" />`
    : `<span style="font-size:20px;font-weight:600;color:#111827;">${escapeHtml(appName)}</span>`;
  const footer =
    opts.footerHtml ||
    `Diese E-Mail wurde automatisch von ${escapeHtml(appName)} versendet.`;

  return `<!doctype html>
<html lang="de">
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
                ${logo}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background-color:#f9fafb;color:#9ca3af;font-size:12px;">
                ${footer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
