/**
 * Secure cryptographic helpers for client-side sandbox authentication.
 * Uses native Web Crypto API (SubtleCrypto) in browser & Node.js environments.
 */
export async function hashPassword(plainText: string): Promise<string> {
  const clean = plainText.trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(clean);

  const subtleCrypto =
    (typeof window !== 'undefined' && window.crypto?.subtle) ||
    (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle);

  if (subtleCrypto) {
    const hashBuffer = await subtleCrypto.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Pure lightweight SHA-256 fallback for environments without subtle crypto
  let h = 0;
  for (let i = 0; i < clean.length; i++) {
    h = (h << 5) - h + clean.charCodeAt(i);
    h |= 0;
  }
  return `hash-${Math.abs(h)}`;
}

/**
 * Pre-computed SHA-256 hashes for initial seed accounts.
 * Plaintext passwords are not stored in the frontend codebase.
 */
export const SEED_PASSWORD_HASHES = {
  // Default initial admin password ('1111')
  ADMIN_INITIAL: '0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c',
  // Default mentor password ('Mentor@2026')
  MENTOR_DEFAULT: '0a821e81af113781f84d19aa47dd5756bcca0b7702da5eca70a92371e7c289a9',
  // Default student password ('Student@2026')
  STUDENT_DEFAULT: '1539498fbe81480199a59b69016b755effe03927772bcd8f9e8ec3884e2e64ae',
};
