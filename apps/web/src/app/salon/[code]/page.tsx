import { SalonRoomClient } from "./SalonRoomClient";

export default async function SalonPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <SalonRoomClient code={code} />;
}
