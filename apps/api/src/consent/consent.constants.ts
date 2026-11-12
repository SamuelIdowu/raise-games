/** Current consent versions. Bump when terms/privacy policy change. */
export const CURRENT_CONSENT = {
  terms: '1.0',
  privacy: '1.0',
} as const;

export type ConsentType = keyof typeof CURRENT_CONSENT;
