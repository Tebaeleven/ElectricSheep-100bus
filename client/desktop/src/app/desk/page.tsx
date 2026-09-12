import { GhostDeskApp } from "@/components/ghost/GhostDeskApp";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Desk",
  description: "Obake on the desk.",
};

export default function DeskPage() {
  return <GhostDeskApp />;
}
