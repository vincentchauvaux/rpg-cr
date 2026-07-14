import { SalonPageShell } from "./SalonPageShell";

export default async function SalonPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <SalonPageShell code={code} />;
}
