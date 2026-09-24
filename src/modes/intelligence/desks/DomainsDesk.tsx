import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { engine, type DomainReading } from '../engine';
import { NeedsEngine } from '../EngineLine';
import { useTask } from '../useTask';
import { Progress } from '../Progress';
import { domainOf, isReady, when, type DeskProps } from '../link';

/**
 * I6 · DOMAINS — WHAT A DOMAIN'S PUBLIC RECORDS SAY.
 *
 * One domain, looked up where each fact is kept: its registration in the
 * registry's own RDAP service (dates, registrar, status — never a registrant's
 * contact details), its mail and verification records in the public DNS, the
 * certificates issued for its hosts (Certificate Transparency), and when the
 * Internet Archive first and last captured it. One domain at a time, because
 * that is what the registries' terms allow; each section that could not be
 * read says why.
 */

export default function DomainsDesk({ engineState, signal, go, receive, take }: DeskProps) {
  const [domain, setDomain] = useState(() => take('domains')?.domain ?? '');
  const { task, problem, running, start } = useTask<DomainReading>(signal);
  const ready = isReady(engineState);

  useEffect(
    () =>
      receive('domains', (h) => {
        if (h.domain) setDomain(h.domain);
      }),
    [receive],
  );

  const name = domainOf(domain.trim());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || !name) return;
    void start(() => engine.domain(name, signal));
  };

  const r = task?.status === 'done' ? (task.result ?? null) : null;
  return (
    <>
      <NeedsEngine state={engineState} />
      <form className="sv-ask" onSubmit={submit} aria-label="Look up a domain">
        <label className="t-mono t-mono-xs sv-label" htmlFor="sv-domain">
          DOMAIN
        </label>
        <input
          id="sv-domain"
          className="sv-question"
          type="text"
          value={domain}
          maxLength={300}
          autoComplete="off"
          spellCheck={false}
          placeholder="example.com"
          onChange={(e) => setDomain(e.target.value)}
        />
        <div className="sv-ask__row">
          <button type="submit" className="sv-btn sv-btn--signal" disabled={!ready || !name || running}>
            {running ? 'LOOKING…' : 'LOOK IT UP'}
          </button>
        </div>
      </form>

      {problem && (
        <p className="t-mono t-mono-xs sv-problem" role="alert">
          {problem.toUpperCase()}
        </p>
      )}
      {task && <Progress task={task} />}

      {r && (
        <section className="sv-answer" aria-label="What the records say">
          <h2 className="t-display-s sv-block__name">{r.domain}</h2>
          <div className="sv-sections">
            <Section title="REGISTRATION — RDAP" problem={r.registration.problem}>
              <Row label="REGISTERED" value={day(r.registration.registered)} />
              <Row label="EXPIRES" value={day(r.registration.expires)} />
              <Row label="LAST CHANGED" value={day(r.registration.changed)} />
              <Row label="REGISTRAR" value={r.registration.registrar} />
              <Row label="STATUS" value={r.registration.status.join(' · ')} />
              <Row label="NAME SERVERS" value={r.registration.nameservers.join(' · ')} />
              <Row label="ASKED" value={r.registration.server} />
            </Section>
            <Section title="MAIL AND VERIFICATION — DNS" problem={r.dns.problem}>
              <Row label="MAIL GOES TO" value={r.dns.mail_hosts.join(' · ')} />
              <Row label="MAIL PROVIDER" value={words(r.dns.mail_provider)} />
              <Row label="SENDS THROUGH" value={r.dns.senders.map(words).join(' · ')} />
              <Row label="DMARC POLICY" value={r.dns.dmarc} />
              <Row label="VERIFIED WITH" value={r.dns.verifications.map(words).join(' · ')} />
            </Section>
            <Section title="CERTIFICATES — CERTIFICATE TRANSPARENCY" problem={r.certificates.problem}>
              <Row label="CERTIFICATES LISTED" value={String(r.certificates.issued)} />
              <Row label="EARLIEST VALID FROM" value={day(r.certificates.first_seen)} />
              <Row label="LATEST VALID UNTIL" value={day(r.certificates.latest_expiry)} />
              <Row label="HOSTS UNDER IT" value={r.certificates.hostnames.join(' · ')} />
              {r.certificates.other_names > 0 && (
                <Row
                  label="OTHER NAMES"
                  value={`${r.certificates.other_names} name(s) of other domains on the same certificates — sharing a certificate is not sharing an owner`}
                />
              )}
            </Section>
            <Section title="ARCHIVE — THE WAYBACK MACHINE" problem={r.archive.problem}>
              <Row label="FIRST CAPTURED" value={day(r.archive.first)} href={r.archive.first_url} />
              <Row label="LAST CAPTURED" value={day(r.archive.last)} href={r.archive.last_url} />
            </Section>
          </div>
          <p className="t-body-s t-dim">
            A field with no answer was not stated by the record asked; it is not said to be empty. The certificates are
            those Cert Spotter lists for the domain, not necessarily every one ever issued.
          </p>
          <p className="sv-actions">
            <button type="button" className="sv-btn" onClick={() => go('sites', { url: `https://${r.domain}` })}>
              READ {r.domain.toUpperCase()}
            </button>
          </p>
          <p className="t-mono t-mono-xs t-faint sv-attribution">{r.sources.join(' · ').toUpperCase()}</p>
        </section>
      )}
    </>
  );
}

function day(iso: string | null): string | null {
  return iso ? when(iso) : null;
}

/** The engine's identifier for a provider or service ("microsoft_365"), as words. */
function words(id: string | null): string | null {
  return id ? id.replace(/_/g, ' ') : null;
}

function Section({ title, problem, children }: { title: string; problem: string | null; children: ReactNode }) {
  return (
    <section className="sv-section">
      <h3 className="t-mono t-mono-xs sv-take__title">{title}</h3>
      {problem ? (
        <p className="t-mono t-mono-xs sv-problem">NOT READ · {problem.toUpperCase()}</p>
      ) : (
        <dl className="sv-facts">{children}</dl>
      )}
    </section>
  );
}

function Row({ label, value, href }: { label: string; value: string | null | undefined; href?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
