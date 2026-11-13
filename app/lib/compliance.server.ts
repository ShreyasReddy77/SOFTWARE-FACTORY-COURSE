// Compliance config. The physical address is one config value, read by the
// /privacy page and (via the Activity email template in Novu) the footer.
// ROLLOUT BLOCKER: a real PO box or registered-agent address must be supplied.

type Env = Record<string, string | undefined>;

export function getPostalAddress(env: Env = process.env): string | null {
  const value = env.NOTIFICATIONS_POSTAL_ADDRESS?.trim();
  return value ? value : null;
}

export function getPrivacyContactEmail(env: Env = process.env): string | null {
  const value = env.PRIVACY_CONTACT_EMAIL?.trim();
  return value ? value : null;
}
