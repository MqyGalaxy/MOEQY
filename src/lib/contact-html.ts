// Build-time only: archived sources remain intact; published content is protected.
import { load } from 'cheerio';
import type { Lang } from './content';
import { contactCopy, contactHref, encodedEmail } from './contact';

const address = Buffer.from(encodedEmail, 'base64').toString('utf8');
const addressPattern = new RegExp(address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('@', '[@#]'), 'gi');
const oldInstructions = /\s*(?:（请将\s*#\s*改为\s*@）|\(please replace\s*#\s*with\s*@\)|\(please change\s*#\s*to\s*@\)|（#を@に置き換えてください）|请将#修改为@。)/gi;

export function protectContactText(text: string, lang: Lang): string {
  return text.replace(oldInstructions, '').replace(addressPattern, contactCopy[lang].send);
}

export function protectContactHtml(html: string, lang: Lang): string {
  const $ = load(html, null, false);
  const label = contactCopy[lang].send;
  const attributes = { href: contactHref(lang), 'data-email': encodedEmail, 'aria-label': label };
  $('a[href]').each((_, element) => {
    const anchor = $(element);
    if (anchor.attr('href')?.toLowerCase() === `mailto:${address}`) {
      anchor.attr(attributes).removeAttr('target').removeAttr('rel');
    }
  });
  // Text nodes only: never insert markup into attributes or nest links.
  $('*').add($.root()).contents().each((_, node) => {
    if (node.type !== 'text' || $(node).parents('script, style, noscript').length) return;
    const original = node.data;
    const text = original.replace(oldInstructions, '');
    const parts = text.split(addressPattern);
    if (parts.length === 1) { node.data = text; return; }
    if ($(node).parents('a').length) { node.data = protectContactText(original, lang); return; }
    const fragment = $('<span></span>');
    parts.forEach((part, index) => {
      if (index) fragment.append($('<a></a>').attr(attributes).text(label));
      fragment.append($('<span></span>').text(part).contents());
    });
    $(node).replaceWith(fragment.contents());
  });
  return $.html();
}

// Preserve the contact section's exact position, including trailing Japanese copy.
export function documentContactParts(html: string): string[] {
  const $ = load(html, null, false);
  const contacts = $('.layout-1').filter((_, el) => $(el).children('.about-contact').length > 0);
  if (!contacts.length) return [html];
  if (contacts.length !== 1) throw new Error('Expected one contact section per document');
  const marker = '<!--moeqy-contact-section-->';
  contacts.replaceWith(marker);
  return $.html().split(marker);
}
