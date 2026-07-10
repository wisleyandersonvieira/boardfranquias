import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";

interface FilterCardProps {
  title?: string;
  /** Texto de apoio abaixo do título (ex.: "Exibindo as 10 contas mais recentes"). */
  description?: ReactNode;
  /** Os campos de filtro. */
  children: ReactNode;
  onApply: () => void;
  onClear: () => void;
  applyLabel?: string;
  clearLabel?: string;
}

/**
 * Card de filtros padrão das páginas de listagem.
 */
export function FilterCard({
  title = "Filtros de Busca",
  description,
  children,
  onApply,
  onClear,
  applyLabel = "Aplicar Filtros",
  clearLabel = "Limpar Filtros",
}: FilterCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          {title}
        </CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {children}
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={onApply}>{applyLabel}</Button>
          <Button variant="outline" onClick={onClear}>
            {clearLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default FilterCard;
