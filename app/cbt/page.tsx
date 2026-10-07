import type { Metadata } from "next";
import CbtRunner from "@/components/cbt/CbtRunner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CBT Practice | Jambito",
  description:
    "Practice JAMB, WAEC and POST UTME past questions with a full CBT engine — timer, question palette and instant explanations.",
};

interface CbtPageProps {
  searchParams: Promise<{
    exam?: string;
    subject?: string;
    year?: string;
  }>;
}

export default async function CbtPage({ searchParams }: CbtPageProps) {
  const params = await searchParams;
  return (
    <CbtRunner
      exam={params.exam}
      subject={params.subject}
      year={params.year}
    />
  );
}
