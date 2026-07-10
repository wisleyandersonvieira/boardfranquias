import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DataTableCardProps {
  title: string;
  children: ReactNode;
}

/**
 * Card que envolve a tabela/listagem das páginas de listagem.
 */
export function DataTableCard({ title, children }: DataTableCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default DataTableCard;
