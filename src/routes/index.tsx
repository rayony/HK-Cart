import { createFileRoute } from "@tanstack/react-router";
import { PriceApp } from "@/components/price-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <PriceApp />;
}
