"use client";

import { Suspense } from "react";
import { PocketStage } from "@/components/companion/PocketStage";

export default function PocketPage() {
  return (
    <Suspense>
      <PocketStage />
    </Suspense>
  );
}
