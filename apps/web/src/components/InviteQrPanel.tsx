"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { roomJoinLink } from "@/lib/config";

const QRCodeSVG = dynamic(
  () => import("qrcode.react").then((m) => m.QRCodeSVG),
  { ssr: false }
);

interface Props {
  code: string;
}

/** QR + lien d'invitation — URLs et SVG uniquement côté client. */
export function InviteQrPanel({ code }: Props) {
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    setShareUrl(roomJoinLink(code));
  }, [code]);

  if (!shareUrl) return null;

  return (
    <>
      <h3 style={{ marginTop: "1rem" }}>Invitation</h3>
      <div className="qr-box">
        <QRCodeSVG value={shareUrl} size={140} />
      </div>
      <p className="share-link muted">{shareUrl}</p>
    </>
  );
}
