import { redirect } from "next/navigation";

export default function WithdrawPage() {
  redirect("/inbox?tab=incoming");
}
