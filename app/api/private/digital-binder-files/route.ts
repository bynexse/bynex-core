import { createServerSupabaseClient } from "@/lib/supabase/server";

type FileLink = {
  id: string;
  organization_id: string;
  project_id: string;
  file_id: string;
  customer_published_at: string | null;
};

type BynexFile = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  title: string;
  description: string | null;
  category: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return Response.json({ error: "Bynex Pärmen är inte konfigurerad." }, { status: 503 });
  }

  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || !userId) {
    return Response.json({ error: "Inloggning krävs." }, { status: 401 });
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("project_portal_members")
    .select("organization_id,project_id,can_view_documents")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("can_view_documents", true);
  if (membershipError) {
    return Response.json({ error: "Kundbehörigheten kunde inte verifieras." }, { status: 500 });
  }

  const projectIds = Array.from(new Set((memberships ?? []).map((item) => item.project_id)));
  if (projectIds.length === 0) return Response.json({ files: [] });

  const [linksResult, projectsResult] = await Promise.all([
    supabase
      .from("bynex_file_links")
      .select("id,organization_id,project_id,file_id,customer_published_at")
      .in("project_id", projectIds)
      .eq("customer_visibility", "published")
      .order("customer_published_at", { ascending: false })
      .limit(500),
    supabase
      .from("projects")
      .select("id,project_number,name")
      .in("id", projectIds),
  ]);
  if (linksResult.error || projectsResult.error) {
    const missing = linksResult.error?.code === "42P01" || linksResult.error?.code === "PGRST205";
    return missing
      ? Response.json({ files: [] })
      : Response.json({ error: "De delade filerna kunde inte hämtas." }, { status: 500 });
  }

  const links = (linksResult.data ?? []) as FileLink[];
  const fileIds = Array.from(new Set(links.map((link) => link.file_id)));
  if (fileIds.length === 0) return Response.json({ files: [] });

  const { data: files, error: filesError } = await supabase
    .from("bynex_files")
    .select("id,storage_bucket,storage_path,original_filename,title,description,category,mime_type,size_bytes,created_at")
    .in("id", fileIds)
    .eq("status", "active")
    .limit(500);
  if (filesError) {
    return Response.json({ error: "De delade filerna kunde inte hämtas." }, { status: 500 });
  }

  const fileById = new Map((files ?? []).map((file) => [file.id, file as BynexFile]));
  const projectById = new Map((projectsResult.data ?? []).map((project) => [project.id, project]));
  const downloadable = await Promise.all(
    links.flatMap((link) => {
      const file = fileById.get(link.file_id);
      const project = projectById.get(link.project_id);
      if (!file || !project) return [];
      return [
        (async () => {
          const { data: signed, error: signedError } = await supabase.storage
            .from(file.storage_bucket)
            .createSignedUrl(file.storage_path, 60 * 10);
          return {
            id: link.id,
            projectId: link.project_id,
            projectNumber: project.project_number,
            projectName: project.name,
            title: file.title,
            description: file.description,
            originalFilename: file.original_filename,
            category: file.category,
            mimeType: file.mime_type,
            sizeBytes: file.size_bytes,
            publishedAt: link.customer_published_at,
            createdAt: file.created_at,
            downloadUrl: signedError ? null : signed?.signedUrl ?? null,
          };
        })(),
      ];
    }),
  );

  return Response.json(
    { files: downloadable },
    { headers: { "cache-control": "private, no-store" } },
  );
}
