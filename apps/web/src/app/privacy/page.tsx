import { redirect } from "next/navigation";

/** Legacy link compatibility: Wisp now directs product help to How it works. */
export default function PrivacyPage() {
  redirect("/how-it-works");
}
