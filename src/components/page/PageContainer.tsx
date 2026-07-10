import { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
}

/**
 * Espaçamento padrão da área de conteúdo de uma página de listagem:
 * cabeçalho + card de filtros + card da tabela.
 */
export function ListPageContainer({ children }: PageContainerProps) {
  return <div className="space-y-6">{children}</div>;
}

/**
 * Espaçamento padrão da área de conteúdo de uma página de formulário:
 * botão voltar + cabeçalho + card com o formulário.
 */
export function FormPageContainer({ children }: PageContainerProps) {
  return <div className="space-y-4">{children}</div>;
}
