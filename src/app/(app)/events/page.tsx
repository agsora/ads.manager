import { redirect } from "next/navigation";

// Events now live in the combined promo & budget calendar.
export default function EventsPage() {
  redirect("/promo");
}
