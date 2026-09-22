import type { Lang } from './content';

// Lightweight obfuscation, not a secret. Never ship the decoded address in HTML.
export const encodedEmail = 'bWFpbEBtb2VxeS5jb20=';
export const contactHref = (lang: Lang) => `${lang === 'zh-CN' ? '' : `/${lang}`}/about/#contact-us`;
export const contactCopy = {
  'zh-CN': { heading: '联系方式', send: '发送邮件', music: '网易云音乐', fallback: '当前浏览器未启用 JavaScript，请通过 GitHub 或其他社交平台联系我。' },
  en: { heading: 'Get in touch', send: 'Send an email', music: 'NetEase Music', fallback: 'JavaScript is disabled. Please contact me through GitHub or another social platform.' },
  ja: { heading: 'お問い合わせ', send: 'メールを送る', music: 'NetEase Music', fallback: 'JavaScript が無効です。GitHub またはほかの SNS からお問い合わせください。' },
} as const;
