import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hostProfiles } from "@/db/schema";
import { ListingForm } from "@/components/HostForms";
import { PageHead } from "@/components/ui";
import { wizardProps } from "@/lib/hostpages";

export default async function NewListing({ params }: LP) {
  const { l, t } = await pageCtx(params);
  const cur = await requireUser(l, `/${l}/host/listings/new`);
  if (!(await db.query.hostProfiles.findFirst({ where: eq(hostProfiles.userId, cur.user.id) }))) redirect(`/${l}/host`);
  return (
    <div className="wrap max-w-5xl pb-10">
      <PageHead eyebrow={t.host.dashboard} title={t.wizard.newTitle} />
      <ListingForm locale={l} t={t.wizard} d={{}} photoCount={0} {...wizardProps(l, t)} />
    </div>
  );
}
