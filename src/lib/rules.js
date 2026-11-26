// Rule: { id, enabled, domain, keyword, colorId, labelId }
// domain may include a path prefix, e.g. "github.com/my-org".
// keyword (optional) must appear in the URL or the page title (case-insensitive).

export function parseDomain(domain) {
  let d = (domain || '').trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, '').replace(/^\*\./, '').replace(/^www\./, '');
  if (!d) return null;
  const slash = d.indexOf('/');
  const host = slash === -1 ? d : d.slice(0, slash);
  const path = slash === -1 ? '' : d.slice(slash);
  return host ? { host, path } : null;
}

export function ruleMatches(rule, url, title) {
  if (!rule || rule.enabled === false) return false;
  const target = parseDomain(rule.domain);
  if (!target) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (!(host === target.host || host.endsWith('.' + target.host))) return false;
  if (target.path && !u.pathname.toLowerCase().startsWith(target.path)) return false;
  const kw = (rule.keyword || '').trim().toLowerCase();
  if (kw && !(url.toLowerCase().includes(kw) || (title || '').toLowerCase().includes(kw))) return false;
  return true;
}

/** First matching rule (rules are evaluated top to bottom). */
export function matchRule(url, title, rules) {
  for (const r of rules || []) {
    if (ruleMatches(r, url, title)) return r;
  }
  return null;
}
