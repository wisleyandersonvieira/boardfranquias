import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  onClick: () => void;
  label?: string;
}

/**
 * Botão "Voltar" do canto superior esquerdo das páginas de formulário.
 */
export function BackButton({ onClick, label = "Voltar" }: BackButtonProps) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="w-fit">
      <ArrowLeft className="h-4 w-4 mr-2" />
      {label}
    </Button>
  );
}

export default BackButton;
