import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  FolderOpen,
  HardHat,
  LogOut,
  MapPin,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import DigitalBinderSubscriptionPanel from "@/components/modules/property/DigitalBinderSubscriptionPanel";
import styles from "./kundportal.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kundportal | Bynex",
  description: "Publicerad projekthistorik, dokument och installationer för din fastighet.",
  robots: { index: false, follow: false },
};

type PortalMember = {
  organization_id: string;
  project_id: string;
  full_name: string;
  portal_role: string;
  can_view_documents: boolean;
  can_view_installations: boolean;
};

type PortalSettings = {
  project_id: string;
  portal_name: string | null;
  welcome_text: string | null;
  status: string;
  share_documents: boolean;
  share_installation_map: boolean;
  project_closed_at: string | null;
  included_access_until: string | null;
  extended_access_active: boolean;
};

type PortalPublication = {
  id: string;
  project_id: string;
  source_type: string;
  title: string;
  summary: string;
  public_payload: unknown;
  occurred_at: string;
  published_at: string | null;
};

type PortalFile = {
  id: string;
  project_id: string;
  publication_id: string;
  file_kind: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  caption: string | null;
  sort_order: number;
};

type DownloadableFile = PortalFile & { downloadUrl: string | null };

const documentTypes = new Set(["document", "drawing", "warranty", "inspection", "handover"]);

function formatDate(value: string | null) {
  if (!value) return "Inte angivet";
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" }).format(new Date(value));
}

function formatBytes(value: number | null) {
  if (value === null) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} kB`;
  return `${(value / (1024 * 1024)).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} MB`;
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function installationFacts(payload: unknown) {
  const item = asObject(payload);
  const zone = asObject(item.zone);
  return [
    ["Installationsnummer", textValue(item.installation_number)],
    ["System", textValue(item.system_type)],
    ["Plats", textValue(zone.name) ?? textValue(zone.code)],
    ["Tillverkare", textValue(item.manufacturer)],
    ["Produkt", textValue(item.product_name)],
    ["Modell", textValue(item.model)],
    ["Serienummer", textValue(item.serial_number)],
    ["Installerad", textValue(item.installed_on) ? formatDate(String(item.installed_on)) : null],
    [
      "Förväntad livslängd",
      numberValue(item.expected_service_life_years) !== null
        ? `${numberValue(item.expected_service_life_years)} år`
        : null,
    ],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));
}

function accessCopy(settings: PortalSettings) {
  if (settings.extended_access_active) {
    return {
      title: "Digitalpärmen är aktiv",
      body: "Fortsatt åtkomst är aktiv även efter den inkluderade perioden.",
      tone: "extended" as const,
    };
  }
  if (settings.included_access_until) {
    return {
      title: `Ingår till ${formatDate(settings.included_access_until)}`,
      body: "Kundportalen ingår under projektet och i ett år efter projektets avslut.",
      tone: "included" as const,
    };
  }
  return {
    title: "Ingår i det pågående projektet",
    body: "När projektet avslutas fortsätter åtkomsten att ingå i ett år.",
    tone: "included" as const,
  };
}

function publicationLabel(type: string) {
  const labels: Record<string, string> = {
    announcement: "Meddelande",
    milestone: "Milstolpe",
    checkin_summary: "Arbetsplats",
    photo: "Foto",
    document: "Dokument",
    drawing: "Ritning",
    change_order: "Ändring",
    delivery: "Leverans",
    deviation: "Avvikelse",
    warranty: "Garanti",
    inspection: "Protokoll",
    weather: "Väder",
    installation: "Installation",
    handover: "Överlämning",
  };
  return labels[type] ?? "Projektuppdatering";
}

function EmptySection({ children }: { children: React.ReactNode }) {
  return <div className={styles.emptySection}>{children}</div>;
}

export default async function CustomerPortalPage() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return (
      <main className={styles.statePage}>
        <div className={styles.stateCard}>
          <ShieldCheck aria-hidden="true" />
          <h1>Kundportalen kan inte öppnas</h1>
          <p>Den säkra inloggningen är inte konfigurerad. Försök igen senare eller kontakta företaget som bjöd in dig.</p>
        </div>
      </main>
    );
  }

  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || !userId) redirect("/kundportal/login");

  const { data: memberRows, error: memberError } = await supabase
    .from("project_portal_members")
    .select("organization_id,project_id,full_name,portal_role,can_view_documents,can_view_installations")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("accepted_at", { ascending: false });

  if (memberError) throw new Error("Kundåtkomsten kunde inte verifieras.");
  const members = (memberRows ?? []) as PortalMember[];

  if (members.length === 0) {
    return (
      <main className={styles.statePage}>
        <section className={styles.stateCard}>
          <Image src="/brand/bynex-wordmark.png" width={148} height={40} alt="Bynex" priority />
          <div className={styles.inactiveIcon}><Clock3 aria-hidden="true" /></div>
          <p className={styles.eyebrow}>Åtkomstläge</p>
          <h1>Ingen aktiv kundportal</h1>
          <p>Det finns ingen aktiv portalbehörighet för din inloggning. Åtkomsten kan ha löpt ut ett år efter projektets avslut eller ha stängts av av projektets ansvariga.</p>
          <p className={styles.stateHint}>Projektmaterialet är inte raderat. Kontakta företaget som bjöd in dig om du vill förlänga åtkomsten med Bynex Digitalpärm.</p>
          <Link className={styles.secondaryButton} href="/kundportal/logout">Logga ut</Link>
        </section>
      </main>
    );
  }

  const projectIds = Array.from(new Set(members.map((member) => member.project_id)));
  const [settingsResult, publicationsResult, filesResult] = await Promise.all([
    supabase
      .from("project_portal_settings")
      .select("project_id,portal_name,welcome_text,status,share_documents,share_installation_map,project_closed_at,included_access_until,extended_access_active")
      .in("project_id", projectIds)
      .eq("enabled", true),
    supabase
      .from("project_portal_publications")
      .select("id,project_id,source_type,title,summary,public_payload,occurred_at,published_at")
      .in("project_id", projectIds)
      .eq("status", "published")
      .order("occurred_at", { ascending: false })
      .limit(500),
    supabase
      .from("project_portal_files")
      .select("id,project_id,publication_id,file_kind,storage_bucket,storage_path,file_name,mime_type,size_bytes,caption,sort_order")
      .in("project_id", projectIds)
      .order("sort_order")
      .limit(500),
  ]);

  if (settingsResult.error || publicationsResult.error || filesResult.error) {
    throw new Error("Det publicerade projektmaterialet kunde inte hämtas.");
  }

  const settings = (settingsResult.data ?? []) as PortalSettings[];
  const publications = (publicationsResult.data ?? []) as PortalPublication[];
  const files = (filesResult.data ?? []) as PortalFile[];
  const visiblePublicationIds = new Set(publications.map((publication) => publication.id));
  const visibleFiles = files.filter((file) => visiblePublicationIds.has(file.publication_id));
  const signedFiles: DownloadableFile[] = await Promise.all(
    visibleFiles.map(async (file) => {
      const { data, error } = await supabase.storage
        .from(file.storage_bucket)
        .createSignedUrl(file.storage_path, 60 * 10);
      return { ...file, downloadUrl: error ? null : data.signedUrl };
    }),
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/kundportal" aria-label="Bynex kundportal">
          <Image src="/brand/bynex-wordmark.png" width={148} height={40} alt="Bynex" priority />
        </Link>
        <div className={styles.headerMeta}>
          <span><ShieldCheck aria-hidden="true" /> Säker kundportal</span>
          <Link href="/kundportal/logout"><LogOut aria-hidden="true" /> Logga ut</Link>
        </div>
      </header>

      <div className={styles.shell}>
        {settings.map((portal, portalIndex) => {
          const member = members.find((item) => item.project_id === portal.project_id);
          if (!member) return null;
          const portalPublications = publications.filter((item) => item.project_id === portal.project_id);
          const installations = portalPublications.filter((item) => item.source_type === "installation");
          const documents = portalPublications.filter((item) => documentTypes.has(item.source_type));
          const timeline = portalPublications.filter((item) => item.source_type !== "installation" && !documentTypes.has(item.source_type));
          const portalFiles = signedFiles.filter((item) => item.project_id === portal.project_id);
          const access = accessCopy(portal);
          const canSeeDocuments = member.can_view_documents && portal.share_documents;
          const canSeeInstallations = member.can_view_installations && portal.share_installation_map;

          return (
            <article className={styles.portal} key={portal.project_id}>
              <section className={styles.hero}>
                <div>
                  <p className={styles.eyebrow}>Din kundportal</p>
                  <h1>{portal.portal_name || `Projekt ${portalIndex + 1}`}</h1>
                  <p className={styles.welcome}>{portal.welcome_text || "Här hittar du projektets publicerade historik och fastighetens digitala underlag."}</p>
                  <div className={styles.memberLine}>
                    <CheckCircle2 aria-hidden="true" /> Inloggad som {member.full_name}
                  </div>
                </div>
                <aside className={`${styles.accessCard} ${styles[access.tone]}`}>
                  <span>Åtkomstläge</span>
                  <strong>{access.title}</strong>
                  <p>{access.body}</p>
                  {portal.project_closed_at && <small>Projektet avslutades {formatDate(portal.project_closed_at)}.</small>}
                </aside>
              </section>

              <nav className={styles.quickLinks} aria-label="Innehåll i kundportalen">
                <a href={`#historik-${portal.project_id}`}><CalendarDays aria-hidden="true" /> Historik <strong>{timeline.length}</strong></a>
                <a href={`#dokument-${portal.project_id}`}><FolderOpen aria-hidden="true" /> Dokument <strong>{canSeeDocuments ? documents.length : 0}</strong></a>
                <a href={`#installationer-${portal.project_id}`}><Wrench aria-hidden="true" /> Installationer <strong>{canSeeInstallations ? installations.length : 0}</strong></a>
              </nav>

              <section className={styles.contentSection} id={`historik-${portal.project_id}`}>
                <div className={styles.sectionHeading}>
                  <div><p className={styles.eyebrow}>Publicerat för dig</p><h2>Projekthistorik</h2></div>
                  <CalendarDays aria-hidden="true" />
                </div>
                {timeline.length === 0 ? (
                  <EmptySection>Det finns inga publicerade projektuppdateringar ännu.</EmptySection>
                ) : (
                  <div className={styles.timeline}>
                    {timeline.map((item) => (
                      <article className={styles.timelineItem} key={item.id}>
                        <div className={styles.timelineDot} />
                        <div>
                          <div className={styles.itemMeta}><span>{publicationLabel(item.source_type)}</span><time dateTime={item.occurred_at}>{formatDate(item.occurred_at)}</time></div>
                          <h3>{item.title}</h3>
                          <p>{item.summary}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.contentSection} id={`dokument-${portal.project_id}`}>
                <div className={styles.sectionHeading}>
                  <div><p className={styles.eyebrow}>Publicerade filer</p><h2>Dokument och ritningar</h2></div>
                  <FolderOpen aria-hidden="true" />
                </div>
                {!canSeeDocuments ? (
                  <EmptySection>Dokumentdelning är inte aktiverad för din behörighet.</EmptySection>
                ) : documents.length === 0 && portalFiles.length === 0 ? (
                  <EmptySection>Det finns inga publicerade dokument eller ritningar ännu.</EmptySection>
                ) : (
                  <div className={styles.documentGrid}>
                    {documents.map((item) => {
                      const itemFiles = portalFiles.filter((file) => file.publication_id === item.id);
                      return (
                        <article className={styles.documentCard} key={item.id}>
                          <div className={styles.documentIcon}><FileText aria-hidden="true" /></div>
                          <span>{publicationLabel(item.source_type)} · {formatDate(item.occurred_at)}</span>
                          <h3>{item.title}</h3>
                          <p>{item.summary}</p>
                          {itemFiles.map((file) => file.downloadUrl ? (
                            <a className={styles.download} href={file.downloadUrl} key={file.id} target="_blank" rel="noreferrer">
                              <Download aria-hidden="true" />
                              <span>{file.caption || file.file_name}<small>{formatBytes(file.size_bytes)}</small></span>
                            </a>
                          ) : (
                            <div className={styles.fileUnavailable} key={file.id}>Filen kan inte öppnas just nu.</div>
                          ))}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className={styles.contentSection} id={`installationer-${portal.project_id}`}>
                <div className={styles.sectionHeading}>
                  <div><p className={styles.eyebrow}>Verifierat relationsunderlag</p><h2>Installationer</h2></div>
                  <HardHat aria-hidden="true" />
                </div>
                {!canSeeInstallations ? (
                  <EmptySection>Installationsunderlaget är inte aktiverat för din behörighet.</EmptySection>
                ) : installations.length === 0 ? (
                  <EmptySection>Det finns inga publicerade installationer ännu.</EmptySection>
                ) : (
                  <div className={styles.installationGrid}>
                    {installations.map((item) => {
                      const facts = installationFacts(item.public_payload);
                      const itemFiles = portalFiles.filter((file) => file.publication_id === item.id);
                      return (
                        <article className={styles.installationCard} key={item.id}>
                          <div className={styles.installationTop}>
                            <div className={styles.installationIcon}><Wrench aria-hidden="true" /></div>
                            <div><span>Verifierad installation</span><h3>{item.title}</h3></div>
                          </div>
                          <p>{item.summary}</p>
                          {facts.length > 0 && <dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
                          {itemFiles.map((file) => file.downloadUrl && (
                            <a className={styles.download} href={file.downloadUrl} key={file.id} target="_blank" rel="noreferrer">
                              <MapPin aria-hidden="true" /><span>{file.caption || file.file_name}<small>{formatBytes(file.size_bytes)}</small></span>
                            </a>
                          ))}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </article>
          );
        })}

        {settings.length > 0 && <DigitalBinderSubscriptionPanel />}

        {settings.length === 0 && (
          <section className={styles.stateCard}>
            <Clock3 aria-hidden="true" />
            <h1>Portalen är inte tillgänglig</h1>
            <p>Din medlemskoppling finns, men ingen aktiv och behörig portal kunde läsas. Kontakta projektets ansvariga.</p>
          </section>
        )}
      </div>
    </main>
  );
}
