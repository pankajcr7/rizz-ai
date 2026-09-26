/**
 * Strip contact details before chat text leaves our server. Suggestions never
 * need a real phone number or email, and it keeps third-party PII out of logs
 * and model requests.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// 7+ digits, optionally separated by spaces, dots, dashes or parens, optional +country code.
const PHONE = /(?<!\w)(?:\+|\()?\d(?:[\s().-]*\d){6,}(?!\w)/g;

export function redact(text: string): string {
  return text.replace(EMAIL, "[email]").replace(PHONE, "[phone]");
}
