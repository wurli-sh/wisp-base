import { redirect } from "next/navigation";

export default function BalancePage() {
  redirect("/account?tab=wallet");
}
