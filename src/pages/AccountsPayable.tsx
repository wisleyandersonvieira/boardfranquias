import PageLayout from "@/components/page/PageLayout";
import AccountsPayableManager from "@/components/AccountsPayableManager";

/**
 * Página dedicada de Contas a Pagar. Registrada como /accounts-payable/* para
 * que o componente permaneça montado ao navegar entre a listagem, o cadastro,
 * a edição e a visualização.
 */
const AccountsPayable = () => (
  <PageLayout>
    <AccountsPayableManager />
  </PageLayout>
);

export default AccountsPayable;
